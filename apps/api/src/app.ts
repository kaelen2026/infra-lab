// The API composition — pure wiring, runtime-agnostic.
//
// This builds the fully-configured Hono app from already-constructed collaborators
// (db, redis, better-auth, the OTP/session services, repositories, the image store,
// …). It performs no I/O at import time and reaches for no global driver, so it can
// be driven by either bootstrap:
//   - `server.ts`  — Node runtime (`@hono/node-server`), local dev / tests / Render / docker.
//   - `worker.ts`  — Cloudflare Workers (`export default { fetch }`), with the Neon /
//                    Upstash / R2 adapters injected instead of postgres-js / ioredis / disk.
//
// Middleware order and route mounting are the single source of truth for the request
// pipeline — keep the order intact (see the security constraints in
// `.claude/skills/api-architecture`).

import type { Auth, CliDeviceFlowService, OtpService } from "@infra/auth";
import type { Db } from "@infra/db";
import type { CoreEnv } from "@infra/env/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { checkReadiness, type Pingable } from "./observability/health.js";
import type { Logger } from "./observability/logger.js";
import { createMetrics } from "./observability/metrics.js";
import { type ObsEnv, observability } from "./observability/middleware.js";
import { createRateLimiter, type RateLimitStore } from "./rate-limit.js";
import { type AdminRepository, createAdminRoutes } from "./routes/admin.routes.js";
import {
  clientIp,
  createAuthRoutes,
  type SessionService,
  type UserRepository,
} from "./routes/auth.routes.js";
import { createMcpRoutes } from "./routes/mcp.routes.js";
import { createNotificationRoutes } from "./routes/notification.routes.js";
import { createQrRoutes, type QrTicketStore } from "./routes/qr.routes.js";
import { createSocialRoutes, type SocialAuthService } from "./routes/social.routes.js";
import {
  createTimelineRoutes,
  type ImageStore,
  type TimelinePostRepository,
} from "./routes/timeline.routes.js";
import { createTodoRoutes, type TodoRepository } from "./routes/todo.routes.js";
import { requestBodyLimit, securityHeaders } from "./security.js";
import type { ApnsClient } from "./services/apns-client.js";

/**
 * Everything {@link createApp} needs, already constructed against a concrete runtime.
 * The two bootstraps differ only in which adapters they build for `db` / `redis` /
 * `images` / the OTP + rate-limit stores — the wiring below is identical.
 */
export interface AppDeps {
  /** Validated core env — supplies config knobs (limits, cors allowlist, flags). */
  env: CoreEnv;
  /** Base logger (already scoped with `service`); a request child is made per request. */
  log: Logger;
  /** Only used by `/ready` (`select 1`). Every repository is built from it upstream. */
  db: Db;
  /** Only used by `/ready` (`PING`). ioredis or the Upstash REST client both satisfy it. */
  redis: Pingable;
  /** Better Auth instance; owns `/api/auth/*` and backs `requireUser`. */
  auth: Auth;
  otp: OtpService;
  cliDeviceFlow: CliDeviceFlowService;
  users: UserRepository;
  todos: TodoRepository;
  timeline: TimelinePostRepository;
  admin: AdminRepository;
  images: ImageStore;
  sessions: SessionService;
  /**
   * Social sign-in (Google). Always present; when no provider is configured it
   * simply reports every provider disabled, so the routes answer
   * SOCIAL_PROVIDER_DISABLED rather than 404.
   */
  social: SocialAuthService;
  qrTickets: QrTicketStore;
  /** Counter store backing the transport-level rate limiter. */
  rateLimitStore: RateLimitStore;
  /** Delivery channel for OTP codes (a real SMS provider in production). */
  sms: (phone: string, code: string) => Promise<void>;
  /** APNS client; when present, push is considered configured. Omitted on Workers. */
  apns?: ApnsClient;
  /** APNS host flag, surfaced only in the "configured" log line. */
  apnsProduction?: boolean;
  /**
   * Reports whether the process is draining (shutdown signal received). When it
   * returns true, `/ready` answers 503 so load balancers stop routing new traffic
   * to this replica while in-flight requests finish. Omitted on Workers (no
   * process lifecycle to drain).
   */
  isShuttingDown?: () => boolean;
}

/**
 * Wire the collaborators into the Hono app. Returns `app`; callers serve `app.fetch`
 * (Node `serve` or the Workers default export). No side effects beyond a few boot log
 * lines describing what is enabled.
 */
export function createApp(deps: AppDeps): Hono<ObsEnv> {
  const { env, log } = deps;
  const app = new Hono<ObsEnv>();

  // First middleware: assign a request id, attach a request-scoped logger, and
  // emit one structured access-log line per request (escalating slow ones to warn).
  // The access log's `ip` uses the SAME trusted-proxy resolution as the rate
  // limiter / OTP quotas — never the spoofable leftmost X-Forwarded-For entry —
  // so the logged IP always matches the one security decisions were made against.
  const metrics = createMetrics();
  app.use(
    "*",
    observability(log, {
      slowRequestMs: env.SLOW_REQUEST_MS,
      clientIp: (headers) => clientIp(headers, env.TRUSTED_PROXY_COUNT),
      metrics,
    }),
  );
  // Baseline security response headers on every response (nosniff, frame-options,
  // referrer-policy, HSTS, …). See ./security.ts for the cross-origin-resource-policy note.
  app.use("*", securityHeaders());
  // Cap the request body before any handler buffers it, so one request can't exhaust
  // memory. Kept above the timeline image upload limit; see MAX_REQUEST_BODY_BYTES.
  app.use("*", requestBodyLimit(env.MAX_REQUEST_BODY_BYTES));
  // Browser clients (web on :3000, h5 on :3002) call this API cross-origin and must send
  // the session cookie, so credentials are allowed and the request origin is reflected when
  // it is in the trusted allowlist (a fixed list, never "*", since credentials are enabled).
  app.use("*", cors({ origin: env.TRUSTED_ORIGINS, credentials: true }));

  // Liveness: process is up. Cheap, no dependency calls — safe for a tight probe.
  app.get("/health", (c) => c.json({ ok: true }));
  // Readiness: can we actually serve? Probes Postgres + Redis; 503 when a dep is
  // down. Point your external uptime check here. While draining (shutdown signal
  // received) it answers 503 WITHOUT probing, so load balancers pull this replica
  // out of rotation instead of routing new traffic into a closing server.
  app.get("/ready", async (c) => {
    if (deps.isShuttingDown?.()) {
      return c.json({ ok: false, draining: true }, 503);
    }
    const report = await checkReadiness({ db: deps.db, redis: deps.redis });
    if (!report.ok) c.get("log").warn("readiness check failed", { checks: report.checks });
    return c.json(report, report.ok ? 200 : 503);
  });
  // Prometheus scrape target (text exposition, no metrics SDK). Registered before
  // the rate limiter so scrapes stay exempt, like the health probes. Carries only
  // method/route-pattern/status series — no PII, no secrets — but treat it as an
  // internal endpoint: scrape it from inside the network / firewall it at ingress.
  app.get("/metrics", (c) =>
    c.text(metrics.render(), 200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" }),
  );

  // Coarse per-IP request throttle (transport-level). Registered AFTER /health and
  // /ready so those probes stay exempt, and BEFORE every real route so it wraps the
  // Better-Auth handler and all business routes. The fine-grained per-phone/per-IP OTP
  // quotas still apply on top. Uses the same trusted-client-IP resolution as OTP.
  // Disabled when RATE_LIMIT_MAX is 0.
  if (env.RATE_LIMIT_MAX > 0) {
    app.use(
      "*",
      createRateLimiter({
        store: deps.rateLimitStore,
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
  app.on(["GET", "POST"], "/api/auth/*", (c) => deps.auth.handler(c.req.raw));
  // Our phone-OTP routes.
  app.route(
    "/",
    createAuthRoutes({
      otp: deps.otp,
      users: deps.users,
      sessions: deps.sessions,
      images: deps.images,
      cliDeviceFlow: deps.cliDeviceFlow,
      sms: deps.sms,
      config: {
        debugReturnCode: env.OTP_DEBUG_RETURN_CODE,
        trustedProxyCount: env.TRUSTED_PROXY_COUNT,
        // The CLI opens `${webBaseUrl}/auth/cli` to approve; BETTER_AUTH_URL is the web origin.
        webBaseUrl: env.BETTER_AUTH_URL,
      },
    }),
  );
  // Social sign-in (Google). Native ID-token flow only for now: the client verifies
  // with Google on-device, POSTs the ID token, and we mint the SAME session the OTP
  // flow issues. The web redirect + bridge is a follow-up (design stage 2b).
  app.route(
    "/",
    createSocialRoutes({
      social: deps.social,
      users: deps.users,
      sessions: deps.sessions,
      config: { trustedProxyCount: env.TRUSTED_PROXY_COUNT },
    }),
  );
  // QR cross-device login: an already-authenticated native client (Cookie or Bearer)
  // approves a browser sign-in. Ticket state lives in Redis (its own `qr:*` namespace);
  // consume mints the same HttpOnly session cookie the OTP web flow issues.
  app.route(
    "/",
    createQrRoutes({
      tickets: deps.qrTickets,
      requireUser: (h) => deps.sessions.requireUser(h),
      issueWebSessionForUser: (userId) => deps.sessions.issueWebSessionForUser(userId),
    }),
  );
  // Per-user todo routes (protected; reuse the session resolver for Cookie + Bearer).
  app.route(
    "/",
    createTodoRoutes({ todos: deps.todos, requireUser: (h) => deps.sessions.requireUser(h) }),
  );
  // Remote MCP endpoint for AI clients. Streamable HTTP is represented as one
  // POST-only JSON-RPC endpoint here; tools are authenticated via Cookie/Bearer.
  app.route(
    "/",
    createMcpRoutes({
      todos: deps.todos,
      trustedOrigins: env.TRUSTED_ORIGINS,
      requireUser: (h) => deps.sessions.requireUser(h),
    }),
  );
  // Admin console (web-only): read-only cross-user aggregates gated on the persisted
  // `user.role` (admin). Same session resolver as everything else, so the gate rides
  // Cookie or Bearer; promote a user to admin via scripts/grant-admin.mjs.
  app.route(
    "/",
    createAdminRoutes({
      admin: deps.admin,
      requireUser: (h) => deps.sessions.requireUser(h),
    }),
  );
  // Per-user timeline routes (protected) plus the public GET /uploads/:name image
  // server. Same session resolver for Cookie + Bearer.
  app.route(
    "/",
    createTimelineRoutes({
      posts: deps.timeline,
      images: deps.images,
      requireUser: (h) => deps.sessions.requireUser(h),
    }),
  );

  // Push notifications (APNS). Optional: only when the provider is configured. The
  // dev-only self-push test route is additionally gated on the debug flag so it can
  // never be reached in production. Not wired on Cloudflare Workers (its node:http2
  // transport is unsupported there); push stays disabled unless a Node runtime injects it.
  if (deps.apns) {
    if (env.OTP_DEBUG_RETURN_CODE) {
      app.route(
        "/",
        createNotificationRoutes({
          apns: deps.apns,
          push: deps.users,
          requireUser: (h) => deps.sessions.requireUser(h),
        }),
      );
      log.warn("dev push test route mounted at POST /notifications/test");
    }
    log.info("apns push configured", { production: deps.apnsProduction ?? false });
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

  return app;
}
