import { randomUUID } from "node:crypto";
import { TIMELINE_IMAGE_MAX_BYTES } from "@infra/shared";
import { describe, expect, it } from "vitest";
import {
  createTimelineRoutes,
  type ImageStore,
  type TimelineListPosition,
  type TimelinePostRecord,
  type TimelinePostRepository,
} from "../src/routes/timeline.routes.js";

// undici's Response.json() is typed as unknown; tests assert on dynamic shapes.
const readJson = (res: Response): Promise<any> => res.json() as Promise<any>;

// ── In-memory, per-user timeline repository ───────────────────────────────────────
class FakeTimelineRepository implements TimelinePostRepository {
  rows = new Map<string, TimelinePostRecord & { userId: string }>();

  async list(
    userId: string,
    { limit, before }: { limit: number; before?: TimelineListPosition },
  ): Promise<TimelinePostRecord[]> {
    const olderThanBefore = (r: TimelinePostRecord) =>
      !before ||
      r.createdAt.getTime() < before.createdAt.getTime() ||
      (r.createdAt.getTime() === before.createdAt.getTime() && r.id < before.id);
    return [...this.rows.values()]
      .filter((r) => r.userId === userId)
      .filter(olderThanBefore)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .slice(0, limit);
  }
  async create(
    userId: string,
    input: { text: string; images: { url: string }[] },
  ): Promise<TimelinePostRecord> {
    const now = new Date();
    const row = {
      id: randomUUID(),
      userId,
      text: input.text,
      images: input.images,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }
  async remove(userId: string, id: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return false;
    this.rows.delete(id);
    return true;
  }
}

// ── In-memory image store ───────────────────────────────────────────────────────
class FakeImageStore implements ImageStore {
  saved = new Map<string, { bytes: Uint8Array; contentType: string }>();
  private seq = 0;

  async save(input: { bytes: Uint8Array; contentType: string }) {
    const subtype = input.contentType.split("/")[1] ?? "bin";
    const ext = subtype === "jpeg" ? "jpg" : subtype;
    const name = `img-${++this.seq}.${ext}`;
    this.saved.set(name, { bytes: input.bytes, contentType: input.contentType });
    return { name, url: `/uploads/${name}` };
  }
  async read(name: string) {
    return this.saved.get(name) ?? null;
  }
  async has(name: string) {
    return this.saved.has(name);
  }
}

function fakeRequireUser(current: { id: string | null }) {
  return async () => (current.id ? { id: current.id } : null);
}

function setup() {
  const posts = new FakeTimelineRepository();
  const images = new FakeImageStore();
  const current: { id: string | null } = { id: "user_a" };
  const app = createTimelineRoutes({ posts, images, requireUser: fakeRequireUser(current) });
  return { app, posts, images, current };
}

function jsonReq(
  app: ReturnType<typeof createTimelineRoutes>,
  method: string,
  path: string,
  body?: unknown,
) {
  return app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function uploadReq(
  app: ReturnType<typeof createTimelineRoutes>,
  bytes: Uint8Array,
  contentType: string,
  filename = "photo.jpg",
) {
  const form = new FormData();
  form.append("file", new File([bytes], filename, { type: contentType }));
  return app.request("/timeline/images", { method: "POST", body: form });
}

const bytes = (n: number) => new Uint8Array(n).fill(1);

describe("timeline routes — auth guard", () => {
  it("rejects every route with 401 UNAUTHORIZED when unauthenticated", async () => {
    const { app, current } = setup();
    current.id = null;
    for (const [method, path, body] of [
      ["GET", "/timeline", undefined],
      ["POST", "/timeline", { text: "x" }],
      ["DELETE", "/timeline/abc", undefined],
    ] as const) {
      const res = await jsonReq(app, method, path, body);
      expect(res.status).toBe(401);
      expect((await readJson(res)).code).toBe("UNAUTHORIZED");
    }
    const upload = await uploadReq(app, bytes(4), "image/jpeg");
    expect(upload.status).toBe(401);
  });
});

describe("POST /timeline — validation", () => {
  it("rejects an empty post (no text, no images) with 400", async () => {
    const { app } = setup();
    const res = await jsonReq(app, "POST", "/timeline", { text: "   ", images: [] });
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("INVALID_REQUEST");
  });

  it("rejects a forged (non-uploaded) image url with 400", async () => {
    const { app } = setup();
    const res = await jsonReq(app, "POST", "/timeline", {
      text: "hi",
      images: [{ url: "/uploads/../secret.jpg" }],
    });
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("INVALID_REQUEST");
  });

  it("rejects a well-formed url that was never uploaded with 400", async () => {
    const { app } = setup();
    const res = await jsonReq(app, "POST", "/timeline", {
      text: "hi",
      images: [{ url: "/uploads/ghost.jpg" }],
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /timeline/images — upload", () => {
  it("stores a valid image and returns its url", async () => {
    const { app } = setup();
    const res = await uploadReq(app, bytes(16), "image/jpeg");
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.image.url).toMatch(/^\/uploads\/.+\.jpg$/);
    expect(body.image.contentType).toBe("image/jpeg");
  });

  it("rejects an unsupported content type with 415", async () => {
    const { app } = setup();
    const res = await uploadReq(app, bytes(8), "text/plain", "note.txt");
    expect(res.status).toBe(415);
    expect((await readJson(res)).code).toBe("UNSUPPORTED_IMAGE_TYPE");
  });

  it("rejects an oversized upload with 413", async () => {
    const { app } = setup();
    const res = await uploadReq(app, bytes(TIMELINE_IMAGE_MAX_BYTES + 1), "image/png", "big.png");
    expect(res.status).toBe(413);
    expect((await readJson(res)).code).toBe("IMAGE_TOO_LARGE");
  });

  it("rejects a request with no file field with 400", async () => {
    const { app } = setup();
    const res = await app.request("/timeline/images", { method: "POST", body: new FormData() });
    expect(res.status).toBe(400);
  });
});

describe("timeline lifecycle", () => {
  it("uploads → creates a post → lists it → serves the image → deletes it", async () => {
    const { app } = setup();

    // 1. upload an image
    const uploaded = await readJson(await uploadReq(app, bytes(32), "image/jpeg"));
    const url: string = uploaded.image.url;

    // 2. create a post referencing it
    const created = await jsonReq(app, "POST", "/timeline", {
      text: "第一条动态",
      images: [{ url }],
    });
    expect(created.status).toBe(201);
    const post = (await readJson(created)).post;
    expect(post.text).toBe("第一条动态");
    expect(post.images).toEqual([{ url }]);

    // 3. list shows it
    const listed = await readJson(await jsonReq(app, "GET", "/timeline"));
    expect(listed.posts).toHaveLength(1);
    expect(listed.posts[0].id).toBe(post.id);

    // 4. the image is served with its content type
    const image = await app.request(url, { method: "GET" });
    expect(image.status).toBe(200);
    expect(image.headers.get("Content-Type")).toBe("image/jpeg");

    // 5. delete the post
    const del = await jsonReq(app, "DELETE", `/timeline/${post.id}`);
    expect(del.status).toBe(200);
    const after = await readJson(await jsonReq(app, "GET", "/timeline"));
    expect(after.posts).toHaveLength(0);
  });

  it("allows a text-only post (no images)", async () => {
    const { app } = setup();
    const res = await jsonReq(app, "POST", "/timeline", { text: "只有文字" });
    expect(res.status).toBe(201);
    expect((await readJson(res)).post.images).toEqual([]);
  });

  it("404s a missing image url and a missing post delete", async () => {
    const { app } = setup();
    expect((await app.request("/uploads/missing.jpg", { method: "GET" })).status).toBe(404);
    expect((await jsonReq(app, "DELETE", "/timeline/nope")).status).toBe(404);
  });
});

describe("GET /timeline — cursor pagination", () => {
  /** Insert rows with controlled (createdAt, id) so page boundaries are deterministic. */
  function seed(repo: FakeTimelineRepository, userId: string, stamps: [id: string, at: number][]) {
    for (const [id, at] of stamps) {
      repo.rows.set(id, {
        id,
        userId,
        text: id,
        images: [],
        createdAt: new Date(at),
        updatedAt: new Date(at),
      });
    }
  }

  const BASE = 1_700_000_000_000;

  it("walks the whole feed via nextCursor without skips or duplicates (incl. createdAt ties)", async () => {
    const { app, posts } = setup();
    // b and c share a createdAt: the id tie-breaker must order them (c before b)
    // and keep the page boundary exact.
    seed(posts, "user_a", [
      ["a", BASE + 4000],
      ["b", BASE + 3000],
      ["c", BASE + 3000],
      ["d", BASE + 2000],
      ["e", BASE + 1000],
    ]);

    const ids: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const path = cursor
        ? `/timeline?limit=2&cursor=${encodeURIComponent(cursor)}`
        : "/timeline?limit=2";
      const res = await jsonReq(app, "GET", path);
      expect(res.status).toBe(200);
      const body = await readJson(res);
      ids.push(...body.posts.map((p: { id: string }) => p.id));
      cursor = body.nextCursor;
      pages += 1;
    } while (cursor !== null && pages < 10);

    expect(pages).toBe(3); // 2 + 2 + 1
    expect(ids).toEqual(["a", "c", "b", "d", "e"]);
  });

  it("returns nextCursor null when the feed fits exactly one page", async () => {
    const { app, posts } = setup();
    seed(posts, "user_a", [
      ["a", BASE + 2000],
      ["b", BASE + 1000],
    ]);
    const body = await readJson(await jsonReq(app, "GET", "/timeline?limit=2"));
    expect(body.posts).toHaveLength(2);
    expect(body.nextCursor).toBeNull();
  });

  it("defaults the limit when the query is empty", async () => {
    const { app, posts } = setup();
    seed(posts, "user_a", [["a", BASE]]);
    const body = await readJson(await jsonReq(app, "GET", "/timeline"));
    expect(body.posts).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
  });

  it("rejects a malformed cursor with 400", async () => {
    const { app } = setup();
    const res = await jsonReq(app, "GET", "/timeline?cursor=not-a-cursor");
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("INVALID_REQUEST");
  });

  it("rejects an out-of-range limit with 400", async () => {
    const { app } = setup();
    for (const limit of ["0", "51", "abc", "1.5"]) {
      const res = await jsonReq(app, "GET", `/timeline?limit=${limit}`);
      expect(res.status).toBe(400);
      expect((await readJson(res)).code).toBe("INVALID_REQUEST");
    }
  });

  it("scopes a page (and its cursor) to the authenticated user", async () => {
    const { app, posts, current } = setup();
    seed(posts, "user_a", [
      ["a1", BASE + 3000],
      ["a2", BASE + 2000],
    ]);
    seed(posts, "user_b", [["b1", BASE + 2500]]);

    const first = await readJson(await jsonReq(app, "GET", "/timeline?limit=1"));
    expect(first.posts.map((p: { id: string }) => p.id)).toEqual(["a1"]);

    // Replaying user_a's cursor as user_b must only ever window user_b's feed.
    current.id = "user_b";
    const replay = await readJson(
      await jsonReq(app, "GET", `/timeline?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`),
    );
    expect(replay.posts.map((p: { id: string }) => p.id)).toEqual(["b1"]);
  });
});

describe("owner isolation", () => {
  it("never exposes or deletes another user's post", async () => {
    const { app, current } = setup();
    current.id = "user_a";
    const post = (await readJson(await jsonReq(app, "POST", "/timeline", { text: "私密" }))).post;

    current.id = "user_b";
    const list = await readJson(await jsonReq(app, "GET", "/timeline"));
    expect(list.posts).toHaveLength(0);
    expect((await jsonReq(app, "DELETE", `/timeline/${post.id}`)).status).toBe(404);

    current.id = "user_a";
    const back = await readJson(await jsonReq(app, "GET", "/timeline"));
    expect(back.posts).toHaveLength(1);
  });
});
