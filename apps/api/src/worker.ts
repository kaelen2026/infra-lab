// Cloudflare Workers entry. Builds the Workers-native adapters (Neon serverless
// Postgres, Upstash REST Redis, R2 object storage) from the request-time `env`
// bindings, wires them through the shared `createApp`, and exposes the standard
// `export default { fetch }`. The Node runtime lives in `server.ts`; the request
// pipeline itself is shared (`app.ts`).
//
// Requires `nodejs_compat` (node:crypto for OTP/JWT hashing) — see wrangler.toml.
// APNS is intentionally not wired here: its node:http2 transport is unsupported on
// Workers, and push is opt-in.

import type { ExecutionContext, R2Bucket } from "@cloudflare/workers-types";
import { createAuth, createCliDeviceFlowService, createOtpService } from "@infra/auth";
import { createNeonDb, schema } from "@infra/db/neon";
import { parseCoreEnv } from "@infra/env/core";
import {
  createUpstashOtpStore,
  createUpstashRateLimitStore,
  createUpstashRedis,
} from "@infra/redis/upstash";
import type { Hono } from "hono";
import { createApp } from "./app.js";
import { createLogger, type LogLevel } from "./observability/logger.js";
import type { ObsEnv } from "./observability/middleware.js";
import { createAdminRepository } from "./services/admin-repository.js";
import { createRedisQrTicketStore } from "./services/qr-ticket-store.js";
import { createR2ImageStore } from "./services/r2-image-store.js";
import { createSessionService } from "./services/session-service.js";
import { createTimelineRepository } from "./services/timeline-repository.js";
import { createTodoRepository } from "./services/todo-repository.js";
import { createUserRepository } from "./services/user-repository.js";

const DAY = 60 * 60 * 24;

/**
 * Worker bindings: string vars + secrets (set via `wrangler secret put` / dashboard)
 * and the R2 bucket. The non-secret vars live in wrangler.toml `[vars]`. Everything
 * else the app needs is derived from these through `parseCoreEnv`.
 */
export interface WorkerEnv {
  // Secrets
  DATABASE_URL: string;
  OTP_SECRET: string;
  BETTER_AUTH_SECRET: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  // Vars ([vars] in wrangler.toml)
  BETTER_AUTH_URL: string;
  NODE_ENV?: string;
  TRUSTED_ORIGINS?: string;
  COOKIE_DOMAIN?: string;
  COOKIE_SECURE?: string;
  TRUSTED_PROXY_COUNT?: string;
  LOG_LEVEL?: string;
  RATE_LIMIT_MAX?: string;
  RATE_LIMIT_WINDOW_SECONDS?: string;
  MAX_REQUEST_BODY_BYTES?: string;
  SLOW_REQUEST_MS?: string;
  OTP_DEBUG_RETURN_CODE?: string;
  // Bindings
  IMAGES: R2Bucket;
}

const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];
function toLogLevel(value: string | undefined): LogLevel | undefined {
  return LOG_LEVELS.includes(value as LogLevel) ? (value as LogLevel) : undefined;
}

// Built once per isolate and reused across requests: constructing the Neon pool /
// Upstash client / repositories per request would add latency and connection churn.
let cachedApp: Hono<ObsEnv> | undefined;

function buildApp(env: WorkerEnv): Hono<ObsEnv> {
  // The core schema requires REDIS_URL, but the Workers path talks to Upstash over
  // REST (URL + token), not a redis:// connection. Satisfy the validator with the
  // REST URL; the value is never used to open a connection here.
  const source = {
    ...(env as unknown as Record<string, string | undefined>),
    REDIS_URL: env.UPSTASH_REDIS_REST_URL,
  };
  const core = parseCoreEnv(source);

  const log = createLogger({ level: toLogLevel(env.LOG_LEVEL), base: { service: "api" } });

  const db = createNeonDb(core.DATABASE_URL);
  const redis = createUpstashRedis(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
  const otpStore = createUpstashOtpStore(redis);

  const auth = createAuth({
    db,
    schema,
    secret: core.BETTER_AUTH_SECRET,
    baseURL: core.BETTER_AUTH_URL,
    trustedOrigins: core.TRUSTED_ORIGINS,
    cookie: { secure: core.COOKIE_SECURE, domain: core.COOKIE_DOMAIN },
  });

  const sessions = createSessionService({
    db,
    auth,
    secret: core.BETTER_AUTH_SECRET,
    cookie: { name: "infra.session", secure: core.COOKIE_SECURE, domain: core.COOKIE_DOMAIN },
    ttl: { webSeconds: 30 * DAY, accessSeconds: 15 * 60, refreshSeconds: 30 * DAY },
  });

  // OTP delivery stub — mirrors server.ts: the code is surfaced only under the dev
  // debug flag, never in a production-like config.
  const sms = async (phone: string, code: string): Promise<void> => {
    if (core.OTP_DEBUG_RETURN_CODE) log.warn("dev sms stub: delivering code", { phone, code });
    else log.debug("sms code dispatched");
  };

  return createApp({
    env: core,
    log,
    db,
    redis,
    auth,
    otp: createOtpService({ store: otpStore, secret: core.OTP_SECRET }),
    cliDeviceFlow: createCliDeviceFlowService({ store: otpStore, secret: core.OTP_SECRET }),
    users: createUserRepository(db),
    todos: createTodoRepository(db),
    timeline: createTimelineRepository(db),
    admin: createAdminRepository(db),
    images: createR2ImageStore({ bucket: env.IMAGES }),
    sessions,
    qrTickets: createRedisQrTicketStore(otpStore),
    rateLimitStore: createUpstashRateLimitStore(redis),
    sms,
    // No APNS on Workers (node:http2 unsupported); push stays disabled.
  });
}

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Response | Promise<Response> {
    cachedApp ??= buildApp(env);
    // Hono's fetch accepts the (request, env, ctx) Workers signature.
    return cachedApp.fetch(request, env, ctx) as Response | Promise<Response>;
  },
};
