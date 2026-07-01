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
});
