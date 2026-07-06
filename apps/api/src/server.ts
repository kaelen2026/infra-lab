// Node runtime bootstrap. Builds the concrete Node adapters (postgres-js, ioredis,
// local-disk image store, HTTP/2 APNS sender), wires them through `createApp`, and
// serves over `@hono/node-server`. The request pipeline itself lives in `app.ts`,
// shared with the Cloudflare Workers entry (`worker.ts`).
//
// Runtime deps: Postgres + Redis, and the NODE_ENV=production guardrails validated by
// @infra/env/core (COOKIE_SECURE / TRUSTED_PROXY_COUNT / BETTER_AUTH_SECRET, …).

import { serve } from "@hono/node-server";
import { createAuth, createCliDeviceFlowService, createOtpService } from "@infra/auth";
import { createDb, schema } from "@infra/db";
import { apnsConfigFromEnv, loadCoreEnv } from "@infra/env/core";
import { createRedis, createRedisOtpStore, createRedisRateLimitStore } from "@infra/redis";
import { createApp } from "./app.js";
import { createLogger } from "./observability/logger.js";
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

const db = createDb(env.DATABASE_URL);
const redis = createRedis(env.REDIS_URL);
const auth = createAuth({
  db,
  schema,
  secret: env.BETTER_AUTH_SECRET,
  baseURL,
  trustedOrigins: env.TRUSTED_ORIGINS,
  cookie: { secure: env.COOKIE_SECURE, domain: env.COOKIE_DOMAIN },
});

// The OTP + CLI device-flow services and QR ticket store share the one Redis
// connection; their keys live in disjoint namespaces (otp:* / qr:* / rl:*).
const otpStore = createRedisOtpStore(redis);
const otp = createOtpService({ store: otpStore, secret: env.OTP_SECRET });
const cliDeviceFlow = createCliDeviceFlowService({ store: otpStore, secret: env.OTP_SECRET });

const log = createLogger({ base: { service: "api" } });

// Delivery channel standing in for a real SMS provider; the plaintext code is never
// persisted. The phone/code are surfaced only under the same dev flag that already
// returns the code in the response (OTP_DEBUG_RETURN_CODE) — so no PII or secret
// reaches the logs in a production-like config. Replace with a real provider.
const sms = async (phone: string, code: string): Promise<void> => {
  if (env.OTP_DEBUG_RETURN_CODE) log.warn("dev sms stub: delivering code", { phone, code });
  else log.debug("sms code dispatched");
};

const sessions = createSessionService({
  db,
  auth,
  secret: env.BETTER_AUTH_SECRET,
  cookie: { name: "infra.session", secure: env.COOKIE_SECURE, domain: env.COOKIE_DOMAIN },
  ttl: { webSeconds: 30 * DAY, accessSeconds: 15 * 60, refreshSeconds: 30 * DAY },
});

// APNS is optional: enabled only when the full APNS_* set is present.
const apnsConfig = apnsConfigFromEnv(env);
const apns = apnsConfig ? createApnsClient(apnsConfig) : undefined;

const app = createApp({
  env,
  log,
  db,
  redis,
  auth,
  otp,
  cliDeviceFlow,
  users: createUserRepository(db),
  todos: createTodoRepository(db),
  timeline: createTimelineRepository(db),
  admin: createAdminRepository(db),
  // Timeline image uploads: local-directory storage (first cut), served read-only
  // from GET /uploads/:name. UPLOADS_DIR resolves against the API cwd (apps/api).
  images: createLocalImageStore({ dir: env.UPLOADS_DIR }),
  sessions,
  qrTickets: createRedisQrTicketStore(otpStore),
  rateLimitStore: createRedisRateLimitStore(redis),
  sms,
  apns,
  apnsProduction: apnsConfig?.production,
});

const port = env.PORT;
const server = serve({ fetch: app.fetch, port });
log.info("api listening", { port });

// Graceful shutdown. Orchestrators (K8s, Compose, systemd) signal a rolling
// deploy / scale-down with SIGTERM: stop accepting new connections, let in-flight
// requests finish, then release the Postgres + Redis pools. Without this the
// process is killed mid-request and leaks connections on every deploy.
let shuttingDown = false;
const shutdown = (signal: NodeJS.Signals): void => {
  if (shuttingDown) return; // ignore a second signal while already draining
  shuttingDown = true;
  log.info("shutdown signal received, draining", { signal });
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
    process.exit(err ? 1 : 0);
  });
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
