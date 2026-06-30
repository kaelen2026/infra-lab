// Live verification of the OTP service against a real Redis (per acceptance criteria).
// Run after `docker compose up -d` and `pnpm build`:  node scripts/verify-redis.mjs
import { createOtpService, OTP_KEYS } from "../packages/auth/dist/index.js";
import { createRedis, createRedisOtpStore } from "../packages/redis/dist/index.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const OTP_SECRET = process.env.OTP_SECRET ?? "verify-secret";

const redis = createRedis(REDIS_URL);
const otp = createOtpService({ store: createRedisOtpStore(redis), secret: OTP_SECRET });

let failures = 0;
function check(label, cond, detail = "") {
  const ok = Boolean(cond);
  if (!ok) failures++;
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

const suffix = Math.floor(Math.random() * 1e9)
  .toString()
  .padStart(9, "0");
const phoneA = `+86137${suffix}`;
const phoneB = `+86138${suffix}`;
const ip = "203.0.113.50";

try {
  // 1) Send a code → otp key exists with TTL ≤ 300.
  const sent = await otp.requestCode({ phone: phoneA, ip });
  check("requestCode returns ok with 6-digit code", sent.ok && /^\d{6}$/.test(sent.code));
  const codeKey = OTP_KEYS.code(phoneA);
  const stored = await redis.get(codeKey);
  const ttl = await redis.ttl(codeKey);
  check("Redis has otp key after send", stored !== null);
  check(
    "otp key stores a hash, not the plaintext",
    stored !== sent.code && /^[0-9a-f]{64}$/.test(stored ?? ""),
  );
  check("otp TTL is > 0 and <= 300s", ttl > 0 && ttl <= 300, `ttl=${ttl}`);

  // 2) Resend within 60s is rejected.
  const resend = await otp.requestCode({ phone: phoneA, ip });
  check(
    "resend within 60s rejected with RESEND_COOLDOWN",
    !resend.ok && resend.error === "RESEND_COOLDOWN",
  );

  // 3) Five wrong codes → lock for ≤ 600s.
  let last;
  for (let i = 0; i < 5; i++) last = await otp.verifyCode({ phone: phoneA, code: "000000" });
  check("locked after 5 wrong attempts", !last.ok && last.error === "LOCKED");
  const lockTtl = await redis.ttl(OTP_KEYS.lock(phoneA));
  check("lock TTL is > 0 and <= 600s", lockTtl > 0 && lockTtl <= 600, `ttl=${lockTtl}`);

  // 4) Correct code is single-use, and clears otp + attempt keys.
  const sentB = await otp.requestCode({ phone: phoneB, ip });
  const okVerify = await otp.verifyCode({ phone: phoneB, code: sentB.code });
  check("correct code verifies", okVerify.ok === true);
  const replay = await otp.verifyCode({ phone: phoneB, code: sentB.code });
  check("same code cannot be reused", !replay.ok && replay.error === "CODE_EXPIRED");
  check("otp key deleted after success", (await redis.exists(OTP_KEYS.code(phoneB))) === 0);
  check("attempt key deleted after success", (await redis.exists(OTP_KEYS.attempt(phoneB))) === 0);

  // Cleanup
  await redis.del(
    OTP_KEYS.code(phoneA),
    OTP_KEYS.attempt(phoneA),
    OTP_KEYS.cooldown(phoneA),
    OTP_KEYS.lock(phoneA),
    OTP_KEYS.cooldown(phoneB),
  );
} finally {
  redis.disconnect();
}

console.log(failures === 0 ? "\nALL REDIS CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
