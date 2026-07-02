import {
  createTimelinePostSchema,
  TIMELINE_IMAGE_CONTENT_TYPES,
  TIMELINE_IMAGE_MAX_BYTES,
  type TimelineErrorCode,
  type TimelineImageContentType,
  type TimelinePostDTO,
} from "@infra/shared";
import { type Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// ── Ports the routes depend on (implemented in src/services) ─────────────────────
export interface TimelineImageRef {
  url: string;
}

export interface TimelinePostRecord {
  id: string;
  text: string;
  images: TimelineImageRef[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Every method takes the owner's `userId`; the repository enforces per-user
 * isolation so a caller can never read or delete another user's posts.
 */
export interface TimelinePostRepository {
  list(userId: string): Promise<TimelinePostRecord[]>;
  create(
    userId: string,
    input: { text: string; images: TimelineImageRef[] },
  ): Promise<TimelinePostRecord>;
  /** Returns whether a row was actually deleted (false ⇒ missing / not owner). */
  remove(userId: string, id: string): Promise<boolean>;
}

/** Persists image bytes and serves them back. Local-disk adapter in services. */
export interface ImageStore {
  save(input: {
    bytes: Uint8Array;
    contentType: TimelineImageContentType;
  }): Promise<{ url: string; name: string }>;
  read(name: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  /** True when an image with this name exists (used to validate post refs). */
  has(name: string): Promise<boolean>;
}

export interface TimelineRouteDeps {
  posts: TimelinePostRepository;
  images: ImageStore;
  /** Resolve the current user from Cookie or Bearer (null when unauthenticated). */
  requireUser: (headers: Headers) => Promise<{ id: string } | null>;
}

const ERROR_STATUS: Record<TimelineErrorCode, ContentfulStatusCode> = {
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 401,
  TIMELINE_POST_NOT_FOUND: 404,
  IMAGE_TOO_LARGE: 413,
  UNSUPPORTED_IMAGE_TYPE: 415,
};

const IMAGE_URL_PREFIX = "/uploads/";

/** Extract the on-disk name from a `/uploads/<name>` url (null if not one). */
function imageName(url: string): string | null {
  if (!url.startsWith(IMAGE_URL_PREFIX)) return null;
  const name = url.slice(IMAGE_URL_PREFIX.length);
  return name.length > 0 ? name : null;
}

function isAllowedContentType(value: string): value is TimelineImageContentType {
  return (TIMELINE_IMAGE_CONTENT_TYPES as readonly string[]).includes(value);
}

function toPostDTO(record: TimelinePostRecord): TimelinePostDTO {
  return {
    id: record.id,
    text: record.text,
    images: record.images,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function createTimelineRoutes(deps: TimelineRouteDeps): Hono {
  const { posts, images, requireUser } = deps;
  const app = new Hono();

  const fail = (c: Context, code: TimelineErrorCode, extra: Record<string, unknown> = {}) =>
    c.json({ ok: false, code, ...extra }, ERROR_STATUS[code]);

  async function readJson(c: Context): Promise<unknown> {
    try {
      return await c.req.json();
    } catch {
      return undefined;
    }
  }

  // ── List the current user's posts (newest first) ──────────────────────────────
  app.get("/timeline", async (c) => {
    const user = await requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");
    const records = await posts.list(user.id);
    return c.json({ ok: true, posts: records.map(toPostDTO) });
  });

  // ── Upload one image (multipart/form-data, field `file`) ──────────────────────
  // Two-step publish: the client uploads each image here, then references the
  // returned urls when creating the post. Keeps large binaries out of JSON.
  app.post("/timeline/images", async (c) => {
    const user = await requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");

    let file: unknown;
    try {
      file = (await c.req.parseBody()).file;
    } catch {
      return fail(c, "INVALID_REQUEST");
    }
    if (!(file instanceof File)) return fail(c, "INVALID_REQUEST");
    if (!isAllowedContentType(file.type)) return fail(c, "UNSUPPORTED_IMAGE_TYPE");

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) return fail(c, "INVALID_REQUEST");
    if (bytes.byteLength > TIMELINE_IMAGE_MAX_BYTES) return fail(c, "IMAGE_TOO_LARGE");

    const saved = await images.save({ bytes, contentType: file.type });
    return c.json({ ok: true, image: { url: saved.url, contentType: file.type } }, 201);
  });

  // ── Create a post (text and/or uploaded image references) ─────────────────────
  app.post("/timeline", async (c) => {
    const user = await requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");

    const parsed = createTimelinePostSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, "INVALID_REQUEST", { issues: parsed.error.issues });

    // Only accept image urls we actually issued and still hold — blocks a client
    // from persisting a dangling or forged reference.
    for (const image of parsed.data.images) {
      const name = imageName(image.url);
      if (!name || !(await images.has(name))) {
        return fail(c, "INVALID_REQUEST", { reason: "unknown image url" });
      }
    }

    const record = await posts.create(user.id, {
      text: parsed.data.text,
      images: parsed.data.images,
    });
    return c.json({ ok: true, post: toPostDTO(record) }, 201);
  });

  // ── Delete a post ─────────────────────────────────────────────────────────────
  // First cut: removes the row only; the image files linger on disk (a later
  // sweep / object-storage lifecycle rule reclaims them).
  app.delete("/timeline/:id", async (c) => {
    const user = await requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");

    const removed = await posts.remove(user.id, c.req.param("id"));
    if (!removed) return fail(c, "TIMELINE_POST_NOT_FOUND");
    return c.json({ ok: true });
  });

  // ── Serve an uploaded image (public; the uuid filename is the capability) ─────
  // No auth guard on purpose: the unguessable filename is the access token, so a
  // plain <img>/AsyncImage can load it without attaching a bearer.
  app.get("/uploads/:name", async (c) => {
    const loaded = await images.read(c.req.param("name"));
    if (!loaded) return c.json({ ok: false }, 404);
    return new Response(loaded.bytes, {
      headers: {
        "Content-Type": loaded.contentType,
        // Filenames are content-unique (uuid), so the bytes never change.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  });

  return app;
}
