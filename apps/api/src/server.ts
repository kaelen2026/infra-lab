import { serve } from "@hono/node-server";
import { createAuth, createOtpService } from "@infra/auth";
import { createDb, schema } from "@infra/db";
import { createRedis, createRedisOtpStore } from "@infra/redis";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { checkReadiness } from "./observability/health.js";
import { createLogger } from "./observability/logger.js";
import { type ObsEnv, observability } from "./observability/middleware.js";
import { createAuthRoutes } from "./routes/auth.routes.js";
import { createSessionService } from "./services/session-service.js";
import { createUserRepository } from "./services/user-repository.js";

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const DAY = 60 * 60 * 24;

const databaseUrl = env("DATABASE_URL");
const redisUrl = env("REDIS_URL");
const otpSecret = env("OTP_SECRET");
const authSecret = env("BETTER_AUTH_SECRET", otpSecret);
const baseURL = env("BETTER_AUTH_URL", "http://localhost:3000");
const cookieSecure = env("COOKIE_SECURE", "false") === "true";
const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
const debugReturnCode = env("OTP_DEBUG_RETURN_CODE", "false") === "true";

const db = createDb(databaseUrl);
const redis = createRedis(redisUrl);
const auth = createAuth({
  db,
  schema,
  secret: authSecret,
  baseURL,
  trustedOrigins: [baseURL],
  cookie: { secure: cookieSecure, domain: cookieDomain },
});

const otp = createOtpService({ store: createRedisOtpStore(redis), secret: otpSecret });
const users = createUserRepository(db);
const sessions = createSessionService({
  db,
  auth,
  secret: authSecret,
  cookie: { name: "infra.session", secure: cookieSecure, domain: cookieDomain },
  ttl: { webSeconds: 30 * DAY, accessSeconds: 15 * 60, refreshSeconds: 30 * DAY },
});

const log = createLogger({ base: { service: "api" } });

// Delivery channel standing in for a real SMS provider; the plaintext code is
// never persisted. The phone/code are surfaced only under the same dev flag that
// already returns the code in the response (OTP_DEBUG_RETURN_CODE) — so no PII or
// secret reaches the logs in a production-like config. Replace with a real provider.
const sms = async (phone: string, code: string): Promise<void> => {
  if (debugReturnCode) log.warn("dev sms stub: delivering code", { phone, code });
  else log.debug("sms code dispatched");
};

const app = new Hono<ObsEnv>();
// First middleware: assign a request id, attach a request-scoped logger, and
// emit one structured access-log line per request.
app.use("*", observability(log));
// Browser clients (web) call this API cross-origin and must send the session cookie,
// so credentials are allowed and the origin is reflected from the configured web origin.
app.use("*", cors({ origin: baseURL, credentials: true }));

// Liveness: process is up. Cheap, no dependency calls — safe for a tight probe.
app.get("/health", (c) => c.json({ ok: true }));
// Readiness: can we actually serve? Probes Postgres + Redis; 503 when a dep is
// down. Point your external uptime check here.
app.get("/ready", async (c) => {
  const report = await checkReadiness({ db, redis });
  if (!report.ok) c.get("log").warn("readiness check failed", { checks: report.checks });
  return c.json(report, report.ok ? 200 : 503);
});

// Better Auth's own endpoints (used by its client + bearer-token resolution).
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
// Our phone-OTP routes.
app.route("/", createAuthRoutes({ otp, users, sessions, sms, config: { debugReturnCode } }));

// Centralized error handling: log the stack with the request id and return a
// generic 500 so internals never leak to the client.
app.onError((err, c) => {
  c.get("log").error("unhandled error", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return c.json({ ok: false, code: "INTERNAL" }, 500);
});

const port = Number(env("PORT", "3001"));
serve({ fetch: app.fetch, port });
log.info("api listening", { port });
