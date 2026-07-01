import type { OtpStore } from "@infra/auth";
import { Redis, type RedisOptions } from "ioredis";

export type { OtpStore };

/** Create a shared ioredis connection from REDIS_URL. */
export function createRedis(url: string, options: RedisOptions = {}): Redis {
  return new Redis(url, {
    // OTP traffic is latency-sensitive and idempotent; fail fast rather than queue.
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
    ...options,
  });
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
