import type { OtpStore } from "@infra/auth";
import { Redis, type RedisOptions } from "ioredis";

export type { OtpStore };

export interface CreateRedisOptions extends RedisOptions {
  /**
   * Called on every client-level `error` event (connection drops, DNS failures, …).
   * Wire this to the app's structured logger; the error message only carries
   * transport details, never key or value payloads.
   */
  onError?: (err: Error) => void;
}

/**
 * Create a shared ioredis connection from REDIS_URL.
 *
 * An `error` listener is always registered: ioredis emits `error` on transport
 * failures, and an EventEmitter `error` with no listener crashes the process — a
 * Redis blip must degrade to failed commands (per-command rejections + `/ready`
 * flipping), not take the API down. Callers pass `onError` to route the event into
 * their structured logger; the fallback writes one minimal JSON line to stderr
 * (error message only — never a payload).
 */
export function createRedis(url: string, options: CreateRedisOptions = {}): Redis {
  const { onError, ...redisOptions } = options;
  const redis = new Redis(url, {
    // OTP traffic is latency-sensitive and idempotent; fail fast rather than queue.
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
    ...redisOptions,
  });
  const report =
    onError ??
    ((err: Error): void => {
      process.stderr.write(
        `${JSON.stringify({ level: "error", msg: "redis client error", error: err.message })}\n`,
      );
    });
  redis.on("error", report);
  return redis;
}

/**
 * Adapt an ioredis client to the {@link OtpStore} port consumed by the OTP service.
 * This is the only place that knows ioredis' variadic command signatures.
 */
export function createRedisOtpStore(redis: Redis): OtpStore {
  return {
    async set(key, value, opts = {}) {
      const args: (string | number)[] = [];
      if (opts.ttlSeconds != null) args.push("EX", opts.ttlSeconds);
      if (opts.ifNotExists) args.push("NX");
      // ioredis' variadic SET overloads don't model dynamic args well; cast narrowly.
      const run = redis.set.bind(redis) as (...a: unknown[]) => Promise<string | null>;
      const res = await run(key, value, ...args);
      return res === "OK";
    },
    get: (key) => redis.get(key),
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
 * Adapt an ioredis client to the counter port the API's rate limiter consumes
 * (`incr` + `expire`). Structurally matches `RateLimitStore` in `apps/api` without a
 * back-dependency on the app. Shares the same connection as the OTP store — rate-limit
 * keys are namespaced (`rl:*`) and never collide with OTP keys (`otp:*`).
 */
export function createRedisRateLimitStore(redis: Redis) {
  return {
    incr: (key: string) => redis.incr(key),
    async expire(key: string, ttlSeconds: number) {
      return (await redis.expire(key, ttlSeconds)) === 1;
    },
  };
}
