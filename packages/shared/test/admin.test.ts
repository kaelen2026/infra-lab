import { describe, expect, it } from "vitest";
import { listAdminUsersSchema, maskPhone } from "../src/contracts/admin";

describe("maskPhone", () => {
  it("keeps the last 4 digits and stars the rest, preserving a leading +", () => {
    expect(maskPhone("+8613800138000")).toBe("+*********8000");
    expect(maskPhone("13800138000")).toBe("*******8000");
  });

  it("never leaks the raw number", () => {
    expect(maskPhone("+8613800138000")).not.toContain("13800138000");
  });

  it("degrades to all-stars for short/empty input", () => {
    expect(maskPhone("")).toBe("");
    expect(maskPhone("12")).toBe("**");
    expect(maskPhone("+99")).toBe("+**");
  });
});

describe("listAdminUsersSchema", () => {
  it("defaults limit/offset and coerces query strings", () => {
    expect(listAdminUsersSchema.parse({})).toEqual({ limit: 50, offset: 0 });
    expect(listAdminUsersSchema.parse({ limit: "10", offset: "20" })).toEqual({
      limit: 10,
      offset: 20,
    });
  });

  it("rejects out-of-range values", () => {
    expect(listAdminUsersSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(listAdminUsersSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(listAdminUsersSchema.safeParse({ offset: -1 }).success).toBe(false);
  });
});
