import { describe, expect, it } from "vitest";
import { parseCoreEnv } from "../src/core.js";

const base = {
  DATABASE_URL: "postgres://app:app@localhost:5432/app",
  REDIS_URL: "redis://localhost:6379",
  OTP_SECRET: "s".repeat(32),
};

describe("parseCoreEnv", () => {
  it("parses a minimal valid bag and applies defaults", () => {
    const env = parseCoreEnv(base);
    expect(env.DATABASE_URL).toBe(base.DATABASE_URL);
    expect(env.BETTER_AUTH_URL).toBe("http://localhost:3000");
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.OTP_DEBUG_RETURN_CODE).toBe(false);
    expect(env.COOKIE_DOMAIN).toBeUndefined();
    expect(env.PORT).toBe(3001);
  });

  it("defaults BETTER_AUTH_SECRET to OTP_SECRET when unset or empty", () => {
    expect(parseCoreEnv(base).BETTER_AUTH_SECRET).toBe(base.OTP_SECRET);
    expect(parseCoreEnv({ ...base, BETTER_AUTH_SECRET: "" }).BETTER_AUTH_SECRET).toBe(
      base.OTP_SECRET,
    );
    expect(parseCoreEnv({ ...base, BETTER_AUTH_SECRET: "own" }).BETTER_AUTH_SECRET).toBe("own");
  });

  it('coerces flags: only "true" is truthy', () => {
    expect(parseCoreEnv({ ...base, COOKIE_SECURE: "true" }).COOKIE_SECURE).toBe(true);
    expect(parseCoreEnv({ ...base, COOKIE_SECURE: "1" }).COOKIE_SECURE).toBe(false);
    expect(parseCoreEnv({ ...base, OTP_DEBUG_RETURN_CODE: "true" }).OTP_DEBUG_RETURN_CODE).toBe(
      true,
    );
  });

  it("treats an empty COOKIE_DOMAIN as unset", () => {
    expect(parseCoreEnv({ ...base, COOKIE_DOMAIN: "" }).COOKIE_DOMAIN).toBeUndefined();
    expect(parseCoreEnv({ ...base, COOKIE_DOMAIN: "example.com" }).COOKIE_DOMAIN).toBe(
      "example.com",
    );
  });

  it("coerces PORT to a number", () => {
    expect(parseCoreEnv({ ...base, PORT: "4000" }).PORT).toBe(4000);
  });

  it("throws a named error listing every missing required var", () => {
    let message = "";
    try {
      parseCoreEnv({});
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain("Invalid core environment variables");
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("REDIS_URL");
    expect(message).toContain("OTP_SECRET");
    // A raw secret value must never appear in the error output.
    expect(message).not.toContain(base.OTP_SECRET);
  });

  it("rejects a non-numeric PORT", () => {
    expect(() => parseCoreEnv({ ...base, PORT: "not-a-port" })).toThrow(/PORT/);
  });

  it("refuses OTP_DEBUG_RETURN_CODE=true in production, but allows it otherwise", () => {
    let message = "";
    try {
      parseCoreEnv({ ...base, NODE_ENV: "production", OTP_DEBUG_RETURN_CODE: "true" });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain("OTP_DEBUG_RETURN_CODE");
    // The guardrail error must never echo a raw secret value.
    expect(message).not.toContain(base.OTP_SECRET);
    // Non-production keeps the dev convenience flag usable.
    expect(
      parseCoreEnv({ ...base, NODE_ENV: "development", OTP_DEBUG_RETURN_CODE: "true" })
        .OTP_DEBUG_RETURN_CODE,
    ).toBe(true);
    // Production is fine as long as the debug flag is off (with a distinct auth secret).
    expect(
      parseCoreEnv({ ...base, NODE_ENV: "production", BETTER_AUTH_SECRET: "b".repeat(32) })
        .OTP_DEBUG_RETURN_CODE,
    ).toBe(false);
  });

  it("L4 — requires a distinct BETTER_AUTH_SECRET in production (key separation)", () => {
    // Unset in production: no silent fallback to OTP_SECRET.
    const missing = () => parseCoreEnv({ ...base, NODE_ENV: "production" });
    expect(missing).toThrow(/BETTER_AUTH_SECRET/);
    try {
      missing();
    } catch (e) {
      expect(e instanceof Error ? e.message : String(e)).not.toContain(base.OTP_SECRET);
    }

    // Set but equal to OTP_SECRET in production: rejected.
    expect(() =>
      parseCoreEnv({ ...base, NODE_ENV: "production", BETTER_AUTH_SECRET: base.OTP_SECRET }),
    ).toThrow(/BETTER_AUTH_SECRET/);

    // Set and distinct in production: accepted, no fallback applied.
    expect(
      parseCoreEnv({ ...base, NODE_ENV: "production", BETTER_AUTH_SECRET: "b".repeat(32) })
        .BETTER_AUTH_SECRET,
    ).toBe("b".repeat(32));

    // Non-production still allows the dev fallback (BETTER_AUTH_SECRET ?? OTP_SECRET).
    expect(parseCoreEnv({ ...base, NODE_ENV: "development" }).BETTER_AUTH_SECRET).toBe(
      base.OTP_SECRET,
    );
    expect(parseCoreEnv(base).BETTER_AUTH_SECRET).toBe(base.OTP_SECRET);
  });

  it("L1 — parses TRUSTED_PROXY_COUNT (default 0, coerced non-negative int)", () => {
    expect(parseCoreEnv(base).TRUSTED_PROXY_COUNT).toBe(0);
    expect(parseCoreEnv({ ...base, TRUSTED_PROXY_COUNT: "2" }).TRUSTED_PROXY_COUNT).toBe(2);
    const negative = () => parseCoreEnv({ ...base, TRUSTED_PROXY_COUNT: "-1" });
    expect(negative).toThrow(/TRUSTED_PROXY_COUNT/);
  });
});
