import { afterEach, expect, test } from "vitest";
import { wxFetch } from "../src/sdk/wx-fetch";

interface WxRequestOption {
  url: string;
  method?: string;
  header?: Record<string, string>;
  data?: string;
  success: (res: { statusCode: number; data: unknown }) => void;
  fail: (err: { errMsg: string }) => void;
}

function setWx(request: (opt: WxRequestOption) => void): void {
  (globalThis as { wx?: { request: (opt: WxRequestOption) => void } }).wx = { request };
}

afterEach(() => {
  delete (globalThis as { wx?: unknown }).wx;
});

test("maps a 2xx wx.request into an ok Response", async () => {
  setWx((opt) => opt.success({ statusCode: 200, data: { ok: true } }));
  const res = await wxFetch("https://api.example/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  expect(res.ok).toBe(true);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test("marks a non-2xx status as not ok (SDK turns it into HttpAuthError)", async () => {
  setWx((opt) => opt.success({ statusCode: 429, data: { code: "RATE_LIMITED" } }));
  const res = await wxFetch("https://api.example/x");
  expect(res.ok).toBe(false);
  expect(res.status).toBe(429);
});

test("rejects on transport failure", async () => {
  setWx((opt) => opt.fail({ errMsg: "request:fail timeout" }));
  await expect(wxFetch("https://api.example/x")).rejects.toThrow("request:fail timeout");
});

test("forwards method (uppercased), headers, and body to wx.request", async () => {
  const seen: { method?: string; header?: Record<string, string>; data?: string } = {};
  setWx((opt) => {
    seen.method = opt.method;
    seen.header = opt.header;
    seen.data = opt.data;
    opt.success({ statusCode: 200, data: {} });
  });
  await wxFetch("https://api.example/x", {
    method: "post",
    headers: { authorization: "Bearer t" },
    body: '{"a":1}',
  });
  expect(seen.method).toBe("POST");
  expect(seen.header).toEqual({ authorization: "Bearer t" });
  expect(seen.data).toBe('{"a":1}');
});
