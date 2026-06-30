import { describe, expect, it, vi } from "vitest";
import {
  createRequireUser,
  extractBearerToken,
  extractCookie,
  hasCredential,
  UnauthorizedError,
} from "../src/require-user.js";

describe("header extraction", () => {
  it("parses a Bearer token regardless of scheme casing", () => {
    expect(extractBearerToken(new Headers({ authorization: "Bearer abc.def" }))).toBe("abc.def");
    expect(extractBearerToken(new Headers({ authorization: "bearer xyz" }))).toBe("xyz");
    expect(extractBearerToken(new Headers({ authorization: "Basic abc" }))).toBeNull();
    expect(extractBearerToken(new Headers())).toBeNull();
  });

  it("reads a named cookie", () => {
    const h = new Headers({ cookie: "a=1; infra.session=tok123; b=2" });
    expect(extractCookie(h, "infra.session")).toBe("tok123");
    expect(extractCookie(h, "missing")).toBeNull();
  });

  it("detects either credential style", () => {
    expect(hasCredential(new Headers({ authorization: "Bearer t" }), "infra.session")).toBe(true);
    expect(hasCredential(new Headers({ cookie: "infra.session=t" }), "infra.session")).toBe(true);
    expect(hasCredential(new Headers(), "infra.session")).toBe(false);
  });
});

describe("requireUser", () => {
  it("resolves the user for a cookie-based (web) request", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "u1", phone: "+8613800138000" } });
    const requireUser = createRequireUser({ getSession });
    const headers = new Headers({ cookie: "infra.session=tok" });
    const user = await requireUser(headers);
    expect(user.id).toBe("u1");
    expect(getSession).toHaveBeenCalledWith({ headers });
  });

  it("resolves the user for a Bearer-based (native) request", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "u2" } });
    const requireUser = createRequireUser({ getSession });
    const user = await requireUser(new Headers({ authorization: "Bearer access-token" }));
    expect(user.id).toBe("u2");
  });

  it("throws UnauthorizedError when there is no session", async () => {
    const requireUser = createRequireUser({ getSession: async () => null });
    await expect(requireUser(new Headers())).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
