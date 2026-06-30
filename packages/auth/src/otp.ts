import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { AuthErrorCode } from "@infra/shared";
import { OTP_LIMITS } from "@infra/shared";

/**
 * Minimal Redis-shaped port the OTP service depends on. The real adapter lives
 * in `@infra/redis`; tests use the in-memory {@link import("./testing.js").FakeRedis}.
 * Keeping the surface tiny means the domain never imports a Redis driver.
 */
export interface OtpStore {
  /** SET with optional EX (ttlSeconds) and NX (ifNotExists). Returns false if NX and the key existed. */
  set(
    key: string,
    value: string,
    opts?: { ttlSeconds?: number; ifNotExists?: boolean },
  ): Promise<boolean>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<boolean>;
  /** Seconds remaining; -2 if missing, -1 if no expiry. */
  ttl(key: string): Promise<number>;
  exists(key: string): Promise<boolean>;
}

const PREFIX = "otp";

/** All Redis keys this service touches — exported so tests/ops can introspect them. */
export const OTP_KEYS = {
  code: (phone: string) => `${PREFIX}:code:${phone}`,
  attempt: (phone: string) => `${PREFIX}:attempt:${phone}`,
  cooldown: (phone: string) => `${PREFIX}:cooldown:${phone}`,
  lock: (phone: string) => `${PREFIX}:lock:${phone}`,
  daily: (phone: string, day: string) => `${PREFIX}:daily:${phone}:${day}`,
  ip: (ip: string, hour: string) => `${PREFIX}:ip:${ip}:${hour}`,
} as const;

const DAY_SECONDS = 86_400;
const HOUR_SECONDS = 3_600;

export interface OtpServiceConfig {
  store: OtpStore;
  /** HMAC secret — codes are hashed with this before being written to Redis. */
  secret: string;
  /** Injectable clock (epoch ms) for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

export type RequestCodeResult =
  | { ok: true; code: string; ttlSeconds: number; resendAfterSeconds: number }
  | {
      ok: false;
      error: Extract<
        AuthErrorCode,
        "RESEND_COOLDOWN" | "DAILY_LIMIT_EXCEEDED" | "IP_LIMIT_EXCEEDED" | "LOCKED"
      >;
      retryAfter: number;
    };

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; error: "INVALID_CODE"; remainingAttempts: number }
  | { ok: false; error: "LOCKED"; retryAfter: number }
  | { ok: false; error: "CODE_EXPIRED" };

export interface OtpService {
  requestCode(input: { phone: string; ip: string }): Promise<RequestCodeResult>;
  verifyCode(input: { phone: string; code: string; ip?: string }): Promise<VerifyCodeResult>;
}

function hashCode(secret: string, code: string): string {
  return createHmac("sha256", secret).update(code).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function generateCode(length: number): string {
  // crypto.randomInt is uniform; pad so leading zeros are preserved.
  const max = 10 ** length;
  return String(randomInt(0, max)).padStart(length, "0");
}

export function createOtpService(config: OtpServiceConfig): OtpService {
  const { store, secret } = config;
  const now = config.now ?? Date.now;
  const {
    codeLength,
    ttlSeconds,
    resendCooldownSeconds,
    dailyPerPhone,
    hourlyPerIp,
    maxAttempts,
    lockSeconds,
  } = OTP_LIMITS;

  const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const hourKey = (ms: number) => new Date(ms).toISOString().slice(0, 13); // YYYY-MM-DDTHH (UTC)

  async function isLocked(phone: string): Promise<number> {
    const ttl = await store.ttl(OTP_KEYS.lock(phone));
    return ttl > 0 ? ttl : 0;
  }

  async function requestCode(input: { phone: string; ip: string }): Promise<RequestCodeResult> {
    const { phone, ip } = input;
    const ms = now();

    const lockTtl = await isLocked(phone);
    if (lockTtl > 0) return { ok: false, error: "LOCKED", retryAfter: lockTtl };

    const cooldownTtl = await store.ttl(OTP_KEYS.cooldown(phone));
    if (cooldownTtl > 0) {
      return { ok: false, error: "RESEND_COOLDOWN", retryAfter: cooldownTtl };
    }

    // Per-phone daily quota (read-then-incr so a later gate failure doesn't burn a count).
    const dailyK = OTP_KEYS.daily(phone, dayKey(ms));
    const dailyCount = Number((await store.get(dailyK)) ?? 0);
    if (dailyCount >= dailyPerPhone) {
      const ttl = await store.ttl(dailyK);
      return { ok: false, error: "DAILY_LIMIT_EXCEEDED", retryAfter: ttl > 0 ? ttl : DAY_SECONDS };
    }

    // Per-IP hourly quota.
    const ipK = OTP_KEYS.ip(ip, hourKey(ms));
    const ipCount = Number((await store.get(ipK)) ?? 0);
    if (ipCount >= hourlyPerIp) {
      const ttl = await store.ttl(ipK);
      return { ok: false, error: "IP_LIMIT_EXCEEDED", retryAfter: ttl > 0 ? ttl : HOUR_SECONDS };
    }

    // All gates passed — consume quota and issue a fresh code.
    if ((await store.incr(dailyK)) === 1) await store.expire(dailyK, DAY_SECONDS);
    if ((await store.incr(ipK)) === 1) await store.expire(ipK, HOUR_SECONDS);

    const code = generateCode(codeLength);
    await store.set(OTP_KEYS.code(phone), hashCode(secret, code), { ttlSeconds });
    await store.del(OTP_KEYS.attempt(phone)); // reset wrong-attempt counter for the new code
    await store.set(OTP_KEYS.cooldown(phone), "1", { ttlSeconds: resendCooldownSeconds });

    return { ok: true, code, ttlSeconds, resendAfterSeconds: resendCooldownSeconds };
  }

  async function verifyCode(input: { phone: string; code: string }): Promise<VerifyCodeResult> {
    const { phone, code } = input;

    const lockTtl = await isLocked(phone);
    if (lockTtl > 0) return { ok: false, error: "LOCKED", retryAfter: lockTtl };

    const storedHash = await store.get(OTP_KEYS.code(phone));
    if (storedHash === null) return { ok: false, error: "CODE_EXPIRED" };

    if (!safeEqualHex(storedHash, hashCode(secret, code))) {
      const attemptK = OTP_KEYS.attempt(phone);
      const attempts = await store.incr(attemptK);
      if (attempts === 1) await store.expire(attemptK, ttlSeconds);

      if (attempts >= maxAttempts) {
        await store.set(OTP_KEYS.lock(phone), "1", { ttlSeconds: lockSeconds });
        await store.del(OTP_KEYS.code(phone), attemptK);
        return { ok: false, error: "LOCKED", retryAfter: lockSeconds };
      }
      return { ok: false, error: "INVALID_CODE", remainingAttempts: maxAttempts - attempts };
    }

    // Success — wipe code + attempt immediately so the code is strictly single-use.
    await store.del(OTP_KEYS.code(phone), OTP_KEYS.attempt(phone));
    return { ok: true };
  }

  return { requestCode, verifyCode };
}
