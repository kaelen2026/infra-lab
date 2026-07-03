// Coarse per-client request throttle for the API's public surface.
//
// OTP issuance/verification already enforce fine-grained per-phone / per-IP quotas
// inside the Redis OTP domain (see @infra/auth otp.ts). This is the complementary
// *transport-level* guardrail for every other endpoint (refresh, todos, timeline,
// uploads, the Better-Auth handler): a fixed-window counter per client IP that caps
// raw request volume, so a single caller can't hammer a route hard enough to exhaust
// the process or the database. The fine-grained OTP quotas still apply on top.
//
// A pure factory returning hono middleware with an injectable, Redis-shaped store —
// the same ports & adapters shape the OTP service uses — so it unit-tests hermetically
// against an in-memory fake (no live Redis needed).

import type { Context, MiddlewareHandler } from "hono";
import type { ObsEnv } from "./observability/middleware.js";

/**
 * Minimal counter port the limiter depends on. The real adapter lives in
 * `@infra/redis` (`createRedisRateLimitStore`); tests inject an in-memory fake.
 * Structurally a subset of the OTP store, kept tiny so the middleware never imports
 * a Redis driver.
 */
export interface RateLimitStore {
  /** Atomic increment, returning the new value. */
  incr(key: string): Promise<number>;
  /** Set a TTL (seconds) on a key. Returns false if the key does not exist. */
  expire(key: string, ttlSeconds: number): Promise<boolean>;
}

export interface RateLimitOptions {
  store: RateLimitStore;
  /** Window length in seconds. */
  windowSeconds: number;
  /** Max requests allowed per window per client. */
  max: number;
  /** Resolves the client identity to bucket on (e.g. the trusted client IP). */
  clientId: (c: Context) => string;
  /** Key namespace so multiple limiters don't share a counter. Defaults to "req". */
  bucket?: string;
  /** Injectable clock (epoch ms) for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

const KEY_PREFIX = "rl";

function tooManyRequests(c: Context, retryAfterSeconds: number): Response {
  // Same `{ ok, code }` envelope the rest of the API uses, plus a Retry-After hint so
  // a well-behaved client backs off until the window rolls over.
  c.header("Retry-After", String(Math.max(1, retryAfterSeconds)));
  return c.json({ ok: false, code: "RATE_LIMITED" }, 429);
}

/**
 * Fixed-window per-client rate limiter. The window is aligned to wall-clock
 * (`floor(now / windowSeconds)`) and written into the key, so each counter carries
 * its own expiry and no background sweep is needed.
 *
 * Fails **open**: if the store errors (e.g. a Redis blip) the request is allowed
 * through and the failure is logged, so a cache outage degrades the throttle rather
 * than taking the whole API down — readiness (`/ready`) already surfaces Redis health.
 */
export function createRateLimiter(options: RateLimitOptions): MiddlewareHandler<ObsEnv> {
  const { store, windowSeconds, max, clientId } = options;
  const bucket = options.bucket ?? "req";
  const now = options.now ?? Date.now;

  return async (c, next) => {
    const nowSec = Math.floor(now() / 1000);
    const window = Math.floor(nowSec / windowSeconds);
    const key = `${KEY_PREFIX}:${bucket}:${clientId(c)}:${window}`;

    let count: number;
    try {
      count = await store.incr(key);
      // First hit in this window: attach the TTL so the counter self-expires.
      if (count === 1) await store.expire(key, windowSeconds);
    } catch (err) {
      c.get("log").warn("rate limiter store error; failing open", {
        error: err instanceof Error ? err.message : String(err),
      });
      return next();
    }

    if (count > max) {
      // Seconds until the current window ends and the counter resets.
      const retryAfter = (window + 1) * windowSeconds - nowSec;
      c.get("log").warn("rate limit exceeded", {
        bucket,
        path: new URL(c.req.url).pathname,
      });
      return tooManyRequests(c, retryAfter);
    }
    return next();
  };
}
