import { TIMELINE_ROUTES } from "@infra/shared";
import { describe, expect, it } from "vitest";
import { createWebTimelineClient, HttpAuthError } from "../src/index";

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

describe("createWebTimelineClient", () => {
  it("GETs the first page with credentials included and unwraps posts + nextCursor", async () => {
    const { fn, calls } = fakeFetch(200, {
      ok: true,
      posts: [
        {
          id: "p1",
          text: "hi",
          images: [],
          createdAt: "2026-07-02T00:00:00Z",
          updatedAt: "2026-07-02T00:00:00Z",
        },
      ],
      nextCursor: "opaque-token",
    });
    const client = createWebTimelineClient(BASE, fn);

    const page = await client.list();

    expect(page.posts).toHaveLength(1);
    expect(page.posts[0]?.text).toBe("hi");
    expect(page.nextCursor).toBe("opaque-token");
    // No options ⇒ no query string; the server applies its default limit.
    expect(calls[0]?.url).toBe(`${BASE}${TIMELINE_ROUTES.list}`);
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.credentials).toBe("include");
  });

  it("passes cursor and limit through as query params", async () => {
    const { fn, calls } = fakeFetch(200, { ok: true, posts: [], nextCursor: null });
    const client = createWebTimelineClient(BASE, fn);

    const page = await client.list({ cursor: "abc+/=", limit: 5 });

    expect(page.posts).toEqual([]);
    expect(page.nextCursor).toBeNull();
    const url = new URL(calls[0]?.url ?? "");
    expect(url.pathname).toBe(TIMELINE_ROUTES.list);
    expect(url.searchParams.get("cursor")).toBe("abc+/=");
    expect(url.searchParams.get("limit")).toBe("5");
  });

  it("POSTs a create with the text + image refs as JSON", async () => {
    const { fn, calls } = fakeFetch(201, {
      ok: true,
      post: {
        id: "p2",
        text: "note",
        images: [{ url: "/uploads/abc.jpg" }],
        createdAt: "2026-07-02T00:00:00Z",
        updatedAt: "2026-07-02T00:00:00Z",
      },
    });
    const client = createWebTimelineClient(BASE, fn);

    const post = await client.create({ text: "note", images: [{ url: "/uploads/abc.jpg" }] });

    expect(post.id).toBe("p2");
    expect(calls[0]?.url).toBe(`${BASE}${TIMELINE_ROUTES.create}`);
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      text: "note",
      images: [{ url: "/uploads/abc.jpg" }],
    });
  });

  it("uploads an image as multipart form-data (not JSON) and returns the ref", async () => {
    const { fn, calls } = fakeFetch(201, {
      ok: true,
      image: { url: "/uploads/xyz.png", contentType: "image/png" },
    });
    const client = createWebTimelineClient(BASE, fn);

    const image = await client.uploadImage(new Uint8Array([1, 2, 3]), "image/png");

    expect(image.url).toBe("/uploads/xyz.png");
    const call = calls[0];
    if (!call) throw new Error("no call recorded");
    expect(call.url).toBe(`${BASE}${TIMELINE_ROUTES.uploadImage}`);
    expect(call.init.method).toBe("POST");
    expect(call.init.credentials).toBe("include");
    expect(call.init.body).toBeInstanceOf(FormData);
    // The multipart boundary is set by fetch — we must not force application/json.
    expect((call.init.headers as Record<string, string>)?.["content-type"]).toBeUndefined();
  });

  it("DELETEs a post at its per-id path", async () => {
    const { fn, calls } = fakeFetch(200, { ok: true });
    const client = createWebTimelineClient(BASE, fn);

    await client.remove("p3");

    expect(calls[0]?.url).toBe(`${BASE}/timeline/p3`);
    expect(calls[0]?.init.method).toBe("DELETE");
  });

  it("throws a typed HttpAuthError carrying the timeline error code on failure", async () => {
    const { fn } = fakeFetch(413, { code: "IMAGE_TOO_LARGE" });
    const client = createWebTimelineClient(BASE, fn);

    const err = (await client
      .uploadImage(new Uint8Array([0]), "image/jpeg")
      .catch((e: unknown) => e)) as HttpAuthError;

    expect(err).toBeInstanceOf(HttpAuthError);
    expect(err.code).toBe("IMAGE_TOO_LARGE");
    expect(err.status).toBe(413);
  });
});
