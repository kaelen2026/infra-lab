import { describe, expect, it } from "vitest";
import { createOtpService, OTP_KEYS } from "../src/otp.js";
import { FakeRedis } from "../src/testing.js";

const SECRET = "test-otp-secret-please-rotate";
const PHONE = "+8613800138000";
const IP = "203.0.113.7";

function setup() {
  const store = new FakeRedis();
  const otp = createOtpService({ store, secret: SECRET, now: store.now });
  return { store, otp };
}

async function requestOk(otp: ReturnType<typeof createOtpService>, phone = PHONE, ip = IP) {
  const res = await otp.requestCode({ phone, ip });
  if (!res.ok) throw new Error(`expected ok, got ${res.error}`);
  return res;
}

describe("OTP service — requestCode", () => {
  it("issues a 6-digit code with a 300s TTL and stores only a hash", async () => {
    const { store, otp } = setup();

    const res = await requestOk(otp);

    expect(res.code).toMatch(/^\d{6}$/);
    expect(res.ttlSeconds).toBe(300);

    const codeKey = OTP_KEYS.code(PHONE);
    const stored = await store.get(codeKey);
    expect(stored).not.toBeNull();
    // never the plaintext code
    expect(stored).not.toBe(res.code);
    expect(stored).toMatch(/^[0-9a-f]{64}$/); // hex sha256

    const ttl = await store.ttl(codeKey);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300);
  });

  it("rejects a resend within the 60s cooldown", async () => {
    const { otp, store } = setup();
    await requestOk(otp);

    const second = await otp.requestCode({ phone: PHONE, ip: IP });
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("unreachable");
    expect(second.error).toBe("RESEND_COOLDOWN");
    expect(second.retryAfter).toBeGreaterThan(0);
    expect(second.retryAfter).toBeLessThanOrEqual(60);

    // after the cooldown elapses, a resend works again
    store.advance(60);
    await requestOk(otp);
  });

  it("allows at most 10 sends per phone per day", async () => {
    const { otp, store } = setup();
    for (let i = 0; i < 10; i++) {
      await requestOk(otp);
      store.advance(60); // clear cooldown between sends
    }
    const blocked = await otp.requestCode({ phone: PHONE, ip: IP });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error("unreachable");
    expect(blocked.error).toBe("DAILY_LIMIT_EXCEEDED");
  });

  it("allows at most 30 sends per IP per hour (across phones)", async () => {
    const { otp, store } = setup();
    for (let i = 0; i < 30; i++) {
      // distinct phones so the per-phone daily/cooldown limits never trip first
      const phone = `+861380000${String(1000 + i)}`;
      const res = await otp.requestCode({ phone, ip: IP });
      expect(res.ok).toBe(true);
      store.advance(1);
    }
    const blocked = await otp.requestCode({ phone: "+8613800009999", ip: IP });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error("unreachable");
    expect(blocked.error).toBe("IP_LIMIT_EXCEEDED");
  });
});

describe("OTP service — rate-limit atomicity (L2)", () => {
  const dailyKeyFor = (store: FakeRedis, phone = PHONE) =>
    OTP_KEYS.daily(phone, new Date(store.now()).toISOString().slice(0, 10));

  it("does not burn a daily count when the gate rejects (incr is rolled back)", async () => {
    const { otp, store } = setup();
    for (let i = 0; i < 10; i++) {
      await requestOk(otp);
      store.advance(60); // clear cooldown between sends
    }
    // Counter sits exactly at the cap after 10 successful sends.
    expect(Number(await store.get(dailyKeyFor(store)))).toBe(10);

    const blocked = await otp.requestCode({ phone: PHONE, ip: IP });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error("unreachable");
    expect(blocked.error).toBe("DAILY_LIMIT_EXCEEDED");
    // The rejected request rolled its incr back — the counter is still 10, not 11.
    expect(Number(await store.get(dailyKeyFor(store)))).toBe(10);
  });

  it("releases the cooldown on quota overflow so the real reason is reported", async () => {
    const { otp, store } = setup();
    for (let i = 0; i < 10; i++) {
      await requestOk(otp);
      store.advance(60);
    }
    // Two consecutive over-limit calls both surface DAILY_LIMIT_EXCEEDED — the first
    // does not leave a cooldown behind that would mask the second as RESEND_COOLDOWN.
    const first = await otp.requestCode({ phone: PHONE, ip: IP });
    const second = await otp.requestCode({ phone: PHONE, ip: IP });
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    if (first.ok || second.ok) throw new Error("unreachable");
    expect(first.error).toBe("DAILY_LIMIT_EXCEEDED");
    expect(second.error).toBe("DAILY_LIMIT_EXCEEDED");
  });

  it("SET NX cooldown serialises concurrent sends for one phone (only one wins)", async () => {
    const { otp, store } = setup();
    const [a, b] = await Promise.all([
      otp.requestCode({ phone: PHONE, ip: IP }),
      otp.requestCode({ phone: PHONE, ip: IP }),
    ]);
    const oks = [a, b].filter((r) => r.ok).length;
    const cooldowns = [a, b].filter((r) => !r.ok && r.error === "RESEND_COOLDOWN").length;
    expect(oks).toBe(1);
    expect(cooldowns).toBe(1);
    // The loser never consumed quota: the per-phone daily counter is exactly 1.
    expect(Number(await store.get(dailyKeyFor(store)))).toBe(1);
  });
});

describe("OTP service — verifyCode", () => {
  it("accepts the correct code exactly once, then clears otp + attempt keys", async () => {
    const { store, otp } = setup();
    const { code } = await requestOk(otp);

    const ok = await otp.verifyCode({ phone: PHONE, code });
    expect(ok.ok).toBe(true);

    // single-use: the same code cannot be replayed
    const replay = await otp.verifyCode({ phone: PHONE, code });
    expect(replay.ok).toBe(false);
    if (replay.ok) throw new Error("unreachable");
    expect(replay.error).toBe("CODE_EXPIRED");

    // otp + attempt keys are gone
    expect(await store.exists(OTP_KEYS.code(PHONE))).toBe(false);
    expect(await store.exists(OTP_KEYS.attempt(PHONE))).toBe(false);
  });

  it("rejects a wrong code and counts down remaining attempts", async () => {
    const { otp } = setup();
    await requestOk(otp);

    const wrong = await otp.verifyCode({ phone: PHONE, code: "000000" });
    expect(wrong.ok).toBe(false);
    if (wrong.ok || wrong.error !== "INVALID_CODE") throw new Error("expected INVALID_CODE");
    expect(wrong.remainingAttempts).toBe(4);
  });

  it("locks the phone for 600s after 5 wrong attempts", async () => {
    const { store, otp } = setup();
    await requestOk(otp);

    for (let i = 0; i < 4; i++) {
      const r = await otp.verifyCode({ phone: PHONE, code: "111111" });
      expect(r.ok).toBe(false);
    }
    const fifth = await otp.verifyCode({ phone: PHONE, code: "111111" });
    expect(fifth.ok).toBe(false);
    if (fifth.ok) throw new Error("unreachable");
    expect(fifth.error).toBe("LOCKED");

    const lockTtl = await store.ttl(OTP_KEYS.lock(PHONE));
    expect(lockTtl).toBeGreaterThan(0);
    expect(lockTtl).toBeLessThanOrEqual(600);

    // even the correct path is refused while locked
    const requestWhileLocked = await otp.requestCode({ phone: PHONE, ip: IP });
    expect(requestWhileLocked.ok).toBe(false);
    if (requestWhileLocked.ok) throw new Error("unreachable");
    expect(requestWhileLocked.error).toBe("LOCKED");

    // lock clears after the window
    store.advance(600);
    const afterUnlock = await otp.requestCode({ phone: PHONE, ip: IP });
    expect(afterUnlock.ok).toBe(true);
  });

  it("treats an expired code as CODE_EXPIRED", async () => {
    const { store, otp } = setup();
    await requestOk(otp);
    store.advance(301);

    const res = await otp.verifyCode({ phone: PHONE, code: "123456" });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toBe("CODE_EXPIRED");
  });

  it("does not burn an attempt when verifying a phone with no active code", async () => {
    const { store, otp } = setup();

    // No code issued: repeated verifies must not accrue attempts or lock the phone,
    // otherwise anyone could lock out a victim by spamming verify against their number.
    for (let i = 0; i < 10; i++) {
      const res = await otp.verifyCode({ phone: PHONE, code: "000000" });
      expect(res.ok).toBe(false);
      if (res.ok) throw new Error("unreachable");
      expect(res.error).toBe("CODE_EXPIRED");
    }
    expect(await store.exists(OTP_KEYS.attempt(PHONE))).toBe(false);
    expect(await store.exists(OTP_KEYS.lock(PHONE))).toBe(false);
  });

  it("H1 — bounds concurrent verifications to the attempt quota (closes the TOCTOU)", async () => {
    const { otp } = setup();
    const { code } = await requestOk(otp);

    // Burn all but one of the 5 attempts with sequential wrong guesses.
    for (let i = 0; i < 4; i++) {
      const r = await otp.verifyCode({ phone: PHONE, code: "999999" });
      expect(r.ok).toBe(false);
      if (r.ok || r.error !== "INVALID_CODE") throw new Error("expected INVALID_CODE");
    }

    // One attempt remains. Fire a burst of *correct* codes concurrently: the per-phone
    // gate must let exactly one comparison through. On the pre-fix TOCTOU every request
    // read the still-present hash, all matched, and every one returned ok — letting a
    // concurrent burst blow past the 5-try limit.
    const results = await Promise.all(
      Array.from({ length: 20 }, () => otp.verifyCode({ phone: PHONE, code })),
    );
    const okCount = results.filter((r) => r.ok).length;
    expect(okCount).toBe(1);
    // Everything past the quota is rejected as LOCKED, not silently accepted.
    expect(results.filter((r) => !r.ok && r.error === "LOCKED").length).toBe(19);
  });
});
