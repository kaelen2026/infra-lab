import { describe, expect, it } from "vitest";
import {
  createResendClient,
  type FetchLike,
  RESEND_SEND_URL,
} from "../src/services/resend-client.js";

const CONFIG = { apiKey: "re_test_key", from: "Infra Lab <no-reply@example.com>" };

/** Build a fake `fetch` that records its call and returns a canned response. */
function fakeFetch(response: { ok: boolean; status: number; body: string }): {
  fetchImpl: FetchLike;
  calls: Array<{ url: string; init: Parameters<FetchLike>[1] }>;
} {
  const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return { ok: response.ok, status: response.status, text: async () => response.body };
  };
  return { fetchImpl, calls };
}

describe("resend-client", () => {
  it("POSTs to the Resend API with auth + the message fields", async () => {
    const { fetchImpl, calls } = fakeFetch({ ok: true, status: 200, body: '{"id":"email_123"}' });
    const client = createResendClient(CONFIG, { fetchImpl });

    const res = await client.send({
      to: "person@example.com",
      subject: "hi",
      html: "<p>hi</p>",
      text: "hi",
    });

    expect(res).toEqual({ ok: true, id: "email_123" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(RESEND_SEND_URL);
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.headers.authorization).toBe("Bearer re_test_key");
    expect(calls[0]!.init.headers["content-type"]).toBe("application/json");
    const sent = JSON.parse(calls[0]!.init.body);
    expect(sent).toEqual({
      from: CONFIG.from,
      to: "person@example.com",
      subject: "hi",
      html: "<p>hi</p>",
      text: "hi",
    });
  });

  it("succeeds without an id when the 2xx body is not JSON", async () => {
    const { fetchImpl } = fakeFetch({ ok: true, status: 200, body: "" });
    const client = createResendClient(CONFIG, { fetchImpl });
    expect(await client.send({ to: "a@b.com", subject: "s", html: "h", text: "t" })).toEqual({
      ok: true,
    });
  });

  it("maps a non-2xx response to a failure with the provider reason", async () => {
    const { fetchImpl } = fakeFetch({
      ok: false,
      status: 422,
      body: '{"name":"validation_error","message":"from is not a verified domain"}',
    });
    const client = createResendClient(CONFIG, { fetchImpl });
    expect(await client.send({ to: "a@b.com", subject: "s", html: "h", text: "t" })).toEqual({
      ok: false,
      status: 422,
      reason: "from is not a verified domain",
    });
  });

  it("maps a non-2xx with a non-JSON body to a failure without a reason", async () => {
    const { fetchImpl } = fakeFetch({ ok: false, status: 500, body: "upstream boom" });
    const client = createResendClient(CONFIG, { fetchImpl });
    expect(await client.send({ to: "a@b.com", subject: "s", html: "h", text: "t" })).toEqual({
      ok: false,
      status: 500,
      reason: undefined,
    });
  });
});
