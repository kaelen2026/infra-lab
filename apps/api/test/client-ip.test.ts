import { describe, expect, it } from "vitest";
import { clientIp } from "../src/routes/auth.routes.js";

const h = (headers: Record<string, string>) => new Headers(headers);

describe("clientIp — X-Forwarded-For trust boundary (L1)", () => {
  it("does not trust XFF when trustedProxyCount is 0 (default)", () => {
    // A directly-reachable API must not honour a client-set XFF, or an attacker
    // could rotate fake IPs to bypass the per-IP quota.
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4" }))).toBe("0.0.0.0");
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("reads the client from the RIGHT so a forged leftmost entry is ignored", () => {
    // Attacker prepends a spoofed IP; the single trusted proxy appends the real one.
    // With one trusted hop, the real client is the last (rightmost) entry.
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4, 9.9.9.9" }), 1)).toBe("9.9.9.9");
    // Two trusted hops: the two rightmost entries were appended by our proxies, so
    // the real client sits at length-2 (two from the right). The forged leftmost
    // entry (9.9.9.9) is ignored.
    expect(clientIp(h({ "x-forwarded-for": "9.9.9.9, 10.0.0.1, 10.0.0.2" }), 2)).toBe("10.0.0.1");
  });

  it("handles a single-entry XFF behind one proxy", () => {
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7" }), 1)).toBe("203.0.113.7");
  });

  it("clamps to the leftmost entry when fewer hops are present than configured", () => {
    // Misconfiguration / fewer hops than claimed — take what's there rather than crash.
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7" }), 3)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip then a sentinel when XFF is absent", () => {
    expect(clientIp(h({ "x-real-ip": "9.9.9.9" }), 1)).toBe("9.9.9.9");
    expect(clientIp(h({}), 1)).toBe("0.0.0.0");
  });
});
