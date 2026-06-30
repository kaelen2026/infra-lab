import { AUTH_ROUTES } from "@infra/shared";
import { describe, expect, it } from "vitest";
import { createWebAuthClient, HttpAuthError } from "../src/index";

const BASE = "http://api.test";

interface Recorded {
  url: string;
  init: RequestInit;
}

/** Build a fake `fetch` that records the last call and replays a canned response. */
function fakeFetch(status: number, body: unknown) {
  const calls: Recorded[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fn, calls };
}

describe("createWebAuthClient", () => {
  it("POSTs requestOtp to the contract path with credentials included", async () => {
    const { fn, calls } = fakeFetch(200, { ok: true, ttlSeconds: 300, resendAfterSeconds: 60 });
    const client = createWebAuthClient(BASE, fn);

    const res = await client.requestOtp({ phone: "+8613800138000", platform: "web" });

    expect(res.resendAfterSeconds).toBe(60);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("no call recorded");
    expect(call.url).toBe(`${BASE}${AUTH_ROUTES.requestOtp}`);
    expect(call.init.method).toBe("POST");
    expect(call.init.credentials).toBe("include");
    expect(JSON.parse(String(call.init.body))).toEqual({
      phone: "+8613800138000",
      platform: "web",
    });
  });

  it("returns the verified user (web carries no tokens)", async () => {
    const { fn } = fakeFetch(200, {
      ok: true,
      user: { id: "u1", phone: "+8613800138000", displayName: "Mei", isNew: true },
    });
    const client = createWebAuthClient(BASE, fn);

    const res = await client.verifyOtp({
      phone: "+8613800138000",
      code: "123456",
      platform: "web",
    });

    expect(res.user.displayName).toBe("Mei");
    expect(res.tokens).toBeUndefined();
  });

  it("throws a typed HttpAuthError carrying code + retry hints on failure", async () => {
    const { fn } = fakeFetch(429, { code: "RESEND_COOLDOWN", retryAfter: 42 });
    const client = createWebAuthClient(BASE, fn);

    const err = await client
      .requestOtp({ phone: "+8613800138000", platform: "web" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpAuthError);
    const authErr = err as HttpAuthError;
    expect(authErr.code).toBe("RESEND_COOLDOWN");
    expect(authErr.status).toBe(429);
    expect(authErr.retryAfter).toBe(42);
  });

  it("surfaces remainingAttempts from an INVALID_CODE failure", async () => {
    const { fn } = fakeFetch(401, { code: "INVALID_CODE", remainingAttempts: 3 });
    const client = createWebAuthClient(BASE, fn);

    const err = (await client
      .verifyOtp({ phone: "+8613800138000", code: "000000", platform: "web" })
      .catch((e: unknown) => e)) as HttpAuthError;

    expect(err.code).toBe("INVALID_CODE");
    expect(err.remainingAttempts).toBe(3);
  });

  it("unwraps the devices array from the dashboard endpoint", async () => {
    const { fn, calls } = fakeFetch(200, {
      ok: true,
      devices: [{ id: "d1", platform: "ios", deviceId: "abc", model: "iPhone 16" }],
    });
    const client = createWebAuthClient(BASE, fn);

    const devices = await client.listDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0]?.model).toBe("iPhone 16");
    expect(calls[0]?.url).toBe(`${BASE}${AUTH_ROUTES.devices}`);
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.credentials).toBe("include");
  });

  it("unwraps the events array from the dashboard endpoint", async () => {
    const { fn, calls } = fakeFetch(200, {
      ok: true,
      events: [{ id: "e1", platform: "web", ip: "203.0.113.7", success: true }],
    });
    const client = createWebAuthClient(BASE, fn);

    const events = await client.listLoginEvents();

    expect(events[0]?.success).toBe(true);
    expect(calls[0]?.url).toBe(`${BASE}${AUTH_ROUTES.loginEvents}`);
  });
});
