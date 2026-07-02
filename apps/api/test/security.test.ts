import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { requestBodyLimit, securityHeaders } from "../src/security.js";

// undici's Response.json() is typed as unknown; tests assert on dynamic shapes.
const readJson = (res: Response): Promise<any> => res.json() as Promise<any>;

describe("securityHeaders", () => {
  const app = new Hono();
  app.use("*", securityHeaders());
  app.get("/", (c) => c.json({ ok: true }));

  it("sets the baseline hardening headers on a response", async () => {
    const res = await app.request("/");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
  });

  it("uses cross-origin resource policy so browser clients can embed /uploads images", async () => {
    const res = await app.request("/");
    // hono defaults to same-origin, which would block <img> loads from web/h5 origins.
    expect(res.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
  });
});

describe("requestBodyLimit", () => {
  function setup(maxBytes: number) {
    const app = new Hono();
    app.use("*", requestBodyLimit(maxBytes));
    app.post("/echo", async (c) => c.json({ ok: true, body: await c.req.text() }));
    return app;
  }

  const post = (app: Hono, body: string) =>
    app.request("/echo", { method: "POST", body, headers: { "content-type": "text/plain" } });

  it("passes a body at or under the limit through to the handler", async () => {
    const app = setup(16);
    const res = await post(app, "small");
    expect(res.status).toBe(200);
    expect((await readJson(res)).body).toBe("small");
  });

  it("rejects an over-limit body with 413 PAYLOAD_TOO_LARGE in the standard envelope", async () => {
    const app = setup(8);
    const res = await post(app, "x".repeat(64));
    expect(res.status).toBe(413);
    const json = await readJson(res);
    expect(json.ok).toBe(false);
    expect(json.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("leaves the body readable downstream (routes still parse JSON after the limit)", async () => {
    const app = new Hono();
    app.use("*", requestBodyLimit(1024));
    app.post("/json", async (c) => c.json({ echo: await c.req.json() }));
    const res = await app.request("/json", {
      method: "POST",
      body: JSON.stringify({ title: "hi" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    expect((await readJson(res)).echo).toEqual({ title: "hi" });
  });
});
