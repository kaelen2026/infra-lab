import { serve } from "@hono/node-server";
import { createAuth, createCliDeviceFlowService, createOtpService } from "@infra/auth";
import { createDb, schema } from "@infra/db";
import { apnsConfigFromEnv, loadCoreEnv } from "@infra/env/core";
import { createRedis, createRedisOtpStore, createRedisRateLimitStore } from "@infra/redis";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { checkReadiness } from "./observability/health.js";
import { createLogger } from "./observability/logger.js";
import { type ObsEnv, observability } from "./observability/middleware.js";
import { createRateLimiter } from "./rate-limit.js";
import { createAdminRoutes } from "./routes/admin.routes.js";
import { clientIp, createAuthRoutes } from "./routes/auth.routes.js";
import { createNotificationRoutes } from "./routes/notification.routes.js";
import { createQrRoutes } from "./routes/qr.routes.js";
import { createTimelineRoutes } from "./routes/timeline.routes.js";
import { createTodoRoutes } from "./routes/todo.routes.js";
import { requestBodyLimit, securityHeaders } from "./security.js";
import { createAdminRepository } from "./services/admin-repository.js";
import { createApnsClient } from "./services/apns-client.js";
import { createLocalImageStore } from "./services/image-store.js";
import { createRedisQrTicketStore } from "./services/qr-ticket-store.js";
import { createSessionService } from "./services/session-service.js";
import { createTimelineRepository } from "./services/timeline-repository.js";
import { createTodoRepository } from "./services/todo-repository.js";
import { createUserRepository } from "./services/user-repository.js";

const DAY = 60 * 60 * 24;

// Load + validate the core env bucket once, fail-fast. See @infra/env/core.
const env = loadCoreEnv();
const baseURL = env.BETTER_AUTH_URL;
// Origins allowed to call this API cross-origin with credentials: the web/auth origin
// plus any extras (e.g. h5 on :3002). See TRUSTED_ORIGINS in @infra/env/core.
const trustedOrigins = env.TRUSTED_ORIGINS;

const db = createDb(env.DATABASE_URL);
const redis = createRedis(env.REDIS_URL);
const auth = createAuth({
  db,
  schema,
  secret: env.BETTER_AUTH_SECRET,
  baseURL,
  trustedOrigins,
  cookie: { secure: env.COOKIE_SECURE, domain: env.COOKIE_DOMAIN },
});

const otp = createOtpService({ store: createRedisOtpStore(redis), secret: env.OTP_SECRET });
// Browser-assisted CLI login (OAuth device flow). Reuses the same Redis KV port +
// OTP_SECRET (the deviceCode is stored only as an HMAC hash, like OTP codes).
const cliDeviceFlow = createCliDeviceFlowService({
  store: createRedisOtpStore(redis),
  secret: env.OTP_SECRET,
});
const users = createUserRepository(db);
const todos = createTodoRepository(db);
const timeline = createTimelineRepository(db);
// Timeline image uploads: local-directory storage (first cut), served read-only
// from GET /uploads/:name. UPLOADS_DIR resolves against the API cwd (apps/api).
const images = createLocalImageStore({ dir: env.UPLOADS_DIR });
const sessions = createSessionService({
  db,
  auth,
  secret: env.BETTER_AUTH_SECRET,
  cookie: { name: "infra.session", secure: env.COOKIE_SECURE, domain: env.COOKIE_DOMAIN },
  ttl: { webSeconds: 30 * DAY, accessSeconds: 15 * 60, refreshSeconds: 30 * DAY },
});

const log = createLogger({ base: { service: "api" } });

// Delivery channel standing in for a real SMS provider; the plaintext code is
// never persisted. The phone/code are surfaced only under the same dev flag that
// already returns the code in the response (OTP_DEBUG_RETURN_CODE) — so no PII or
// secret reaches the logs in a production-like config. Replace with a real provider.
const sms = async (phone: string, code: string): Promise<void> => {
  if (env.OTP_DEBUG_RETURN_CODE) log.warn("dev sms stub: delivering code", { phone, code });
  else log.debug("sms code dispatched");
};

const app = new Hono<ObsEnv>();
// First middleware: assign a request id, attach a request-scoped logger, and
// emit one structured access-log line per request (escalating slow ones to warn).
app.use("*", observability(log, { slowRequestMs: env.SLOW_REQUEST_MS }));
// Baseline security response headers on every response (nosniff, frame-options,
// referrer-policy, HSTS, …). See ./security.ts for the cross-origin-resource-policy note.
app.use("*", securityHeaders());
// Cap the request body before any handler buffers it, so one request can't exhaust
// memory. Kept above the timeline image upload limit; see MAX_REQUEST_BODY_BYTES.
app.use("*", requestBodyLimit(env.MAX_REQUEST_BODY_BYTES));
// Browser clients (web on :3000, h5 on :3002) call this API cross-origin and must send
// the session cookie, so credentials are allowed and the request origin is reflected when
// it is in the trusted allowlist (a fixed list, never "*", since credentials are enabled).
app.use("*", cors({ origin: trustedOrigins, credentials: true }));

// Liveness: process is up. Cheap, no dependency calls — safe for a tight probe.
app.get("/health", (c) => c.json({ ok: true }));
// Readiness: can we actually serve? Probes Postgres + Redis; 503 when a dep is
// down. Point your external uptime check here.
app.get("/ready", async (c) => {
  const report = await checkReadiness({ db, redis });
  if (!report.ok) c.get("log").warn("readiness check failed", { checks: report.checks });
  return c.json(report, report.ok ? 200 : 503);
});

// Coarse per-IP request throttle (transport-level). Registered AFTER /health and
// /ready so those probes stay exempt, and BEFORE every real route so it wraps the
// Better-Auth handler and all business routes. The fine-grained per-phone/per-IP OTP
// quotas still apply on top. Uses the same trusted-client-IP resolution as OTP.
// Disabled when RATE_LIMIT_MAX is 0.
if (env.RATE_LIMIT_MAX > 0) {
  app.use(
    "*",
    createRateLimiter({
      store: createRedisRateLimitStore(redis),
      max: env.RATE_LIMIT_MAX,
      windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
      clientId: (c) => clientIp(c.req.raw.headers, env.TRUSTED_PROXY_COUNT),
    }),
  );
  log.info("rate limit enabled", {
    max: env.RATE_LIMIT_MAX,
    windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
  });
} else {
  log.warn("rate limit disabled (RATE_LIMIT_MAX=0)");
}

// Better Auth's own endpoints (used by its client + bearer-token resolution).
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
// Our phone-OTP routes.
app.route(
  "/",
  createAuthRoutes({
    otp,
    users,
    sessions,
    cliDeviceFlow,
    sms,
    config: {
      debugReturnCode: env.OTP_DEBUG_RETURN_CODE,
      trustedProxyCount: env.TRUSTED_PROXY_COUNT,
      // The CLI opens `${webBaseUrl}/auth/cli` to approve; BETTER_AUTH_URL is the web origin.
      webBaseUrl: baseURL,
    },
  }),
);
// QR cross-device login: an already-authenticated native client (Cookie or Bearer)
// approves a browser sign-in. Ticket state lives in Redis (its own `qr:*` namespace);
// consume mints the same HttpOnly session cookie the OTP web flow issues.
app.route(
  "/",
  createQrRoutes({
    tickets: createRedisQrTicketStore(createRedisOtpStore(redis)),
    requireUser: (h) => sessions.requireUser(h),
    issueWebSessionForUser: (userId) => sessions.issueWebSessionForUser(userId),
  }),
);
// Per-user todo routes (protected; reuse the session resolver for Cookie + Bearer).
app.route("/", createTodoRoutes({ todos, requireUser: (h) => sessions.requireUser(h) }));
// Admin console (web-only): read-only cross-user aggregates gated on the persisted
// `user.role` (admin). Same session resolver as everything else, so the gate rides
// Cookie or Bearer; promote a user to admin via scripts/grant-admin.mjs.
app.route(
  "/",
  createAdminRoutes({
    admin: createAdminRepository(db),
    requireUser: (h) => sessions.requireUser(h),
  }),
);
// Per-user timeline routes (protected) plus the public GET /uploads/:name image
// server. Same session resolver for Cookie + Bearer.
app.route(
  "/",
  createTimelineRoutes({
    posts: timeline,
    images,
    requireUser: (h) => sessions.requireUser(h),
  }),
);

// Push notifications (APNS). Optional: only when the provider is configured. The
// dev-only self-push test route is additionally gated on the debug flag so it can
// never be reached in production. A real business trigger can call the same
// apns client + user repository directly once defined.
const apnsConfig = apnsConfigFromEnv(env);
if (apnsConfig) {
  const apns = createApnsClient(apnsConfig);
  if (env.OTP_DEBUG_RETURN_CODE) {
    app.route(
      "/",
      createNotificationRoutes({ apns, push: users, requireUser: (h) => sessions.requireUser(h) }),
    );
    log.warn("dev push test route mounted at POST /notifications/test");
  }
  log.info("apns push configured", { production: apnsConfig.production });
} else {
  log.info("apns push not configured (set APNS_* to enable)");
}

// Centralized error handling: log the stack with the request id and return a
// generic 500 so internals never leak to the client.
app.onError((err, c) => {
  c.get("log").error("unhandled error", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return c.json({ ok: false, code: "INTERNAL" }, 500);
});

const port = env.PORT;
serve({ fetch: app.fetch, port });
log.info("api listening", { port });
