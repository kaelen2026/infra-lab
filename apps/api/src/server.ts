import { serve } from "@hono/node-server";
import { createAuth, createOtpService } from "@infra/auth";
import { createDb, schema } from "@infra/db";
import { createRedis, createRedisOtpStore } from "@infra/redis";
import { Hono } from "hono";
import { cors } from "hono/cors";
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

// Replace with a real SMS provider. The plaintext code is never persisted.
const sms = async (phone: string, code: string): Promise<void> => {
  console.log(`[sms] ${phone} -> ${code}`);
};

const app = new Hono();
// Browser clients (web) call this API cross-origin and must send the session cookie,
// so credentials are allowed and the origin is reflected from the configured web origin.
app.use("*", cors({ origin: baseURL, credentials: true }));
app.get("/health", (c) => c.json({ ok: true }));
// Better Auth's own endpoints (used by its client + bearer-token resolution).
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
// Our phone-OTP routes.
app.route("/", createAuthRoutes({ otp, users, sessions, sms, config: { debugReturnCode } }));

const port = Number(env("PORT", "3001"));
serve({ fetch: app.fetch, port });
console.log(`[api] listening on http://localhost:${port}`);
