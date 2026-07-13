// Node runtime bootstrap. Builds the concrete Node adapters (postgres-js, ioredis,
// local-disk image store, HTTP/2 APNS sender), wires them through `createApp`, and
// serves over `@hono/node-server`. The request pipeline itself lives in `app.ts`,
// shared with the Cloudflare Workers entry (`worker.ts`).
//
// Runtime deps: Postgres + Redis, and the NODE_ENV=production guardrails validated by
// @infra/env/core (COOKIE_SECURE / TRUSTED_PROXY_COUNT / BETTER_AUTH_SECRET, …).

import { serve } from "@hono/node-server";
import {
  createAuth,
  createCliDeviceFlowService,
  createOtpService,
  type OAuthCallbackUser,
} from "@infra/auth";
import { createDb, schema } from "@infra/db";
import {
  apnsConfigFromEnv,
  appleConfigFromEnv,
  googleConfigFromEnv,
  loadCoreEnv,
  resendConfigFromEnv,
} from "@infra/env/core";
import { createRedis, createRedisOtpStore, createRedisRateLimitStore } from "@infra/redis";
import { createApp } from "./app.js";
import { createLogger } from "./observability/logger.js";
import { createAccountLinkService } from "./services/account-link-service.js";
import { createAdminRepository } from "./services/admin-repository.js";
import { createApnsClient } from "./services/apns-client.js";
import { createLocalImageStore } from "./services/image-store.js";
import { buildOtpEmail } from "./services/otp-email.js";
import { createRedisQrTicketStore } from "./services/qr-ticket-store.js";
import { createResendClient } from "./services/resend-client.js";
import { createSessionService } from "./services/session-service.js";
import { createSocialAuthService } from "./services/social-auth-service.js";
import { createTimelineRepository } from "./services/timeline-repository.js";
import { createTodoRepository } from "./services/todo-repository.js";
import { createUserRepository } from "./services/user-repository.js";

const DAY = 60 * 60 * 24;

// Load + validate the core env bucket once, fail-fast. See @infra/env/core.
const env = loadCoreEnv();
const baseURL = env.BETTER_AUTH_URL;

const log = createLogger({ base: { service: "api" } });

const db = createDb(env.DATABASE_URL, { max: env.DATABASE_POOL_MAX });
// Client-level errors (connection drops, DNS failures) must land in the structured
// log, not crash the process as an unhandled `error` event. No payloads are logged.
const redis = createRedis(env.REDIS_URL, {
  onError: (err) => log.error("redis client error", { error: err.message }),
});
const users = createUserRepository(db);

// Social sign-in is opt-in per provider: Google when GOOGLE_CLIENT_ID/SECRET are set,
// Apple (native ID-token) when APPLE_CLIENT_ID is set.
const googleConfig = googleConfigFromEnv(env);
const appleConfig = appleConfigFromEnv(env);
// Late-bound: the Google web-redirect bridge (hooks.after in createAuth) provisions the
// profile + audits + mints our session cookie via `users`/`sessions`, and `sessions` is
// constructed AFTER `auth` (it depends on it). A mutable holder breaks the cycle; the
// hook only fires during a request, long after this is assigned below.
let bridgeWebSession: ((info: OAuthCallbackUser) => Promise<string | null>) | null = null;
const auth = createAuth({
  db,
  schema,
  secret: env.BETTER_AUTH_SECRET,
  baseURL,
  trustedOrigins: env.TRUSTED_ORIGINS,
  cookie: { secure: env.COOKIE_SECURE, domain: env.COOKIE_DOMAIN },
  ...(googleConfig
    ? {
        google: googleConfig,
        onOAuthCallbackSession: async (info) => (bridgeWebSession ? bridgeWebSession(info) : null),
      }
    : {}),
  ...(appleConfig
    ? { apple: { clientId: appleConfig.clientId, appBundleIdentifier: appleConfig.clientId } }
    : {}),
});
const enabledSocialProviders = new Set([
  ...(googleConfig ? (["google"] as const) : []),
  ...(appleConfig ? (["apple"] as const) : []),
]);
const social = createSocialAuthService({ auth, enabledProviders: enabledSocialProviders });
const accountLink = createAccountLinkService({ auth, enabledProviders: enabledSocialProviders });
// The OTP + CLI device-flow services and QR ticket store share the one Redis
// connection; their keys live in disjoint namespaces (otp:* / qr:* / rl:*).
const otpStore = createRedisOtpStore(redis);
const otp = createOtpService({ store: otpStore, secret: env.OTP_SECRET });
const cliDeviceFlow = createCliDeviceFlowService({ store: otpStore, secret: env.OTP_SECRET });

// Delivery channel standing in for a real SMS provider; the plaintext code is never
// persisted. The phone/code are surfaced only under the same dev flag that already
// returns the code in the response (OTP_DEBUG_RETURN_CODE) — so no PII or secret
// reaches the logs in a production-like config. Replace with a real provider.
const sms = async (phone: string, code: string): Promise<void> => {
  if (env.OTP_DEBUG_RETURN_CODE) log.warn("dev sms stub: delivering code", { phone, code });
  else log.debug("sms code dispatched");
};

// Email OTP delivery: Resend when configured, else the same dev log stub as `sms`
// (the code is surfaced only under OTP_DEBUG_RETURN_CODE, never in a production-like
// config). A send failure is logged at error for ops — status/reason only, never the
// email or code — and does not throw: the code is valid in Redis for its TTL and the
// user can resend, matching the phone channel's fire-and-forget posture.
const resendConfig = resendConfigFromEnv(env);
const resend = resendConfig ? createResendClient(resendConfig) : undefined;
const sendEmailOtp = resend
  ? async (email: string, code: string): Promise<void> => {
      const res = await resend.send(buildOtpEmail(email, code));
      if (!res.ok) log.error("email otp send failed", { status: res.status, reason: res.reason });
    }
  : async (email: string, code: string): Promise<void> => {
      if (env.OTP_DEBUG_RETURN_CODE) log.warn("dev email stub: delivering code", { email, code });
      else log.debug("email code dispatched");
    };

const sessions = createSessionService({
  db,
  secret: env.BETTER_AUTH_SECRET,
  cookie: { name: "infra.session", secure: env.COOKIE_SECURE, domain: env.COOKIE_DOMAIN },
  ttl: { webSeconds: 30 * DAY, accessSeconds: 15 * 60, refreshSeconds: 30 * DAY },
});
// Bind the OAuth-callback bridge now that users + sessions exist (see above). It
// mirrors the native social route: provision the profile row from Google's name/avatar,
// audit the sign-in, then mint our session cookie. Profile/audit are best-effort — a
// transient DB hiccup must not block the login (the cookie is still issued).
bridgeWebSession = async ({ userId, name, image }) => {
  try {
    await users.ensureProfile(userId, { displayName: name, avatarUrl: image });
    // No source IP at the OAuth-callback hook (it isn't the client's request); record
    // the audited fields we do have. platform=web, no phone for a Google account.
    await users.recordLoginEvent({
      userId,
      phone: null,
      platform: "web",
      ip: null,
      success: true,
    });
  } catch (err) {
    log.warn("google web sign-in: profile/audit side-effect failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return sessions.mintWebSessionCookie(userId);
};

// APNS is optional: enabled only when the full APNS_* set is present.
const apnsConfig = apnsConfigFromEnv(env);
const apns = apnsConfig ? createApnsClient(apnsConfig) : undefined;

// Declared before createApp so `/ready` can observe the draining state and flip
// to 503 the moment a shutdown signal lands (see the `shutdown` block below).
let shuttingDown = false;

const app = createApp({
  env,
  log,
  db,
  redis,
  otp,
  cliDeviceFlow,
  users,
  todos: createTodoRepository(db),
  timeline: createTimelineRepository(db),
  admin: createAdminRepository(db),
  // Timeline image uploads: local-directory storage (first cut), served read-only
  // from GET /uploads/:name. UPLOADS_DIR resolves against the API cwd (apps/api).
  images: createLocalImageStore({ dir: env.UPLOADS_DIR }),
  sessions,
  social,
  accountLink,
  // Serve the OAuth provider callback only when a web-redirect provider is configured
  // (the single mounted Better Auth path — see AppDeps.oauthCallbackHandler).
  ...(enabledSocialProviders.size > 0
    ? { oauthCallbackHandler: (req: Request) => auth.handler(req) }
    : {}),
  qrTickets: createRedisQrTicketStore(otpStore),
  rateLimitStore: createRedisRateLimitStore(redis),
  sms,
  sendEmailOtp,
  apns,
  apnsProduction: apnsConfig?.production,
  isShuttingDown: () => shuttingDown,
});

const port = env.PORT;
const server = serve({ fetch: app.fetch, port });
log.info("api listening", { port });

// Graceful shutdown. Orchestrators (K8s, Compose, systemd) signal a rolling
// deploy / scale-down with SIGTERM: stop accepting new connections, let in-flight
// requests finish, then release the Postgres + Redis pools. Without this the
// process is killed mid-request and leaks connections on every deploy.
// `/ready` flips to 503 the moment `shuttingDown` is set (declared above createApp),
// so load balancers stop routing new traffic while the drain runs.
const shutdown = (reason: string, exitCode = 0): void => {
  if (shuttingDown) return; // ignore a second signal while already draining
  shuttingDown = true;
  log.info("shutdown initiated, draining", { reason });
  // Force-exit backstop: one hung in-flight request would keep server.close()'s
  // callback from ever firing, leaving the process alive until the orchestrator
  // SIGKILLs it (no pool release, no structured trace). unref() so this timer
  // never holds an otherwise-finished process open.
  const force = setTimeout(() => {
    log.error("graceful shutdown timed out, forcing exit", {
      timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    });
    process.exit(1);
  }, env.SHUTDOWN_TIMEOUT_MS);
  force.unref();
  // close() stops accepting new connections and fires the callback once all
  // in-flight requests have completed.
  server.close(async (err) => {
    if (err) log.error("http server close failed", { error: err.message });
    // Release dependency pools even if the http close reported an error, so a
    // half-open server can't pin the PG/Redis connections open.
    const [redisClose, dbClose] = await Promise.allSettled([redis.quit(), db.$client.end()]);
    if (redisClose.status === "rejected")
      log.error("redis close failed", { error: String(redisClose.reason) });
    if (dbClose.status === "rejected")
      log.error("db close failed", { error: String(dbClose.reason) });
    log.info("shutdown complete");
    process.exit(err ? 1 : exitCode);
  });
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Global last-resort handlers: an async throw outside a request (timer, socket,
// fire-and-forget) would otherwise kill the process with no structured context and
// no pool release. Log with stack, then run the SAME graceful path — the process
// still exits non-zero (state after an uncaught throw is suspect; restart, don't
// limp on), but it drains and releases connections on the way out, with the
// force-exit backstop bounding how long that can take.
process.on("uncaughtException", (err) => {
  log.error("uncaught exception", { error: err.message, stack: err.stack });
  shutdown("uncaughtException", 1);
});
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  log.error("unhandled rejection", { error: err.message, stack: err.stack });
  shutdown("unhandledRejection", 1);
});
