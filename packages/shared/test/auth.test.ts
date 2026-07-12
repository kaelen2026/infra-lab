import { describe, expect, it } from "vitest";
import { isCookiePlatform, PLATFORMS, platformSchema } from "../src/contracts/auth";

describe("auth platforms", () => {
  it("includes macos so the macOS client can report its own platform", () => {
    expect(PLATFORMS).toContain("macos");
    expect(platformSchema.parse("macos")).toBe("macos");
  });

  it("treats macos as a Bearer (non-cookie) platform, like the other native clients", () => {
    // Only web rides the HttpOnly cookie channel; macOS authenticates with Bearer + refresh.
    expect(isCookiePlatform("macos")).toBe(false);
  });
});
