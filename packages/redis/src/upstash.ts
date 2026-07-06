// Cloudflare Workers Redis adapter: Upstash over its REST client.
//
// Kept in its own module (subpath `@infra/redis/upstash`) so it — and `@upstash/redis`
// — is only pulled into the Workers bundle, never alongside the ioredis adapters in
// `client.ts` (ioredis opens raw TCP sockets and cannot bundle for Workers).
//
// Implements the exact same `OtpStore` / rate-limit ports the ioredis adapters do, so
// the OTP service, CLI device flow, QR ticket store and rate limiter are unchanged.

import type { OtpStore } from "@infra/auth";
import { Redis } from "@upstash/redis/cloudflare";

export type { OtpStore };

/**
 * Create an Upstash REST client from its REST URL + token.
 *
 * `automaticDeserialization: false` keeps GET returning the raw stored string (OTP
 * code hashes / counters), matching ioredis semantics — otherwise an all-digit hash
 * could be coerced to a number.
 */
export function createUpstashRedis(url: string, token: string): Redis {
  return new Redis({ url, token, automaticDeserialization: false });
}

/** Adapt an Upstash REST client to the {@link OtpStore} port. */
export function createUpstashOtpStore(redis: Redis): OtpStore {
  return {
    async set(key, value, opts = {}) {
      const { ttlSeconds, ifNotExists } = opts;
      // @upstash/redis' SET options are a strict discriminated union, so pick the
      // concrete shape per combination rather than an object of optionals.
      let res: string | null;
      if (ttlSeconds != null && ifNotExists) {
        res = await redis.set(key, value, { ex: ttlSeconds, nx: true });
      } else if (ttlSeconds != null) {
        res = await redis.set(key, value, { ex: ttlSeconds });
      } else if (ifNotExists) {
        res = await redis.set(key, value, { nx: true });
      } else {
        res = await redis.set(key, value);
      }
      return res === "OK";
    },
    get: (key) => redis.get<string>(key),
    del: (...keys) => redis.del(...keys),
    incr: (key) => redis.incr(key),
    decr: (key) => redis.decr(key),
    async expire(key, ttlSeconds) {
      return (await redis.expire(key, ttlSeconds)) === 1;
    },
    ttl: (key) => redis.ttl(key),
    async exists(key) {
      return (await redis.exists(key)) === 1;
    },
  };
}

/**
 * Adapt an Upstash REST client to the counter port the rate limiter consumes
 * (`incr` + `expire`). Mirrors `createRedisRateLimitStore`; keys are namespaced
 * (`rl:*`) and never collide with OTP keys (`otp:*`).
 */
export function createUpstashRateLimitStore(redis: Redis) {
  return {
    incr: (key: string) => redis.incr(key),
    async expire(key: string, ttlSeconds: number) {
      return (await redis.expire(key, ttlSeconds)) === 1;
    },
  };
}
