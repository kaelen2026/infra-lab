import { z } from "zod";

/**
 * Timeline contracts — a per-user feed of posts, each carrying text and/or
 * uploaded images. Mirrors the todo contracts (the single source of truth for
 * request/response shapes, error codes and limits) but is currently only wired
 * up on the iOS client. Every post is scoped to the authenticated user.
 *
 * Image flow (two steps, so a large binary never rides inside a JSON body):
 *   1. `POST /timeline/images` (multipart) → returns a `{ url }` we issued.
 *   2. `POST /timeline` (JSON) → references those urls in `images`.
 * The server persists the bytes to local disk (first cut) and serves them back
 * from `GET /uploads/:name`; the url is always relative so each client resolves
 * it against its own API base.
 */

// ── Limits (shared so client and server agree before a byte is sent) ──────────
export const TIMELINE_TEXT_MAX = 2000;
/** Page size the list endpoint uses when the client sends no `limit`. */
export const TIMELINE_PAGE_LIMIT_DEFAULT = 20;
/** Largest page a client may request. */
export const TIMELINE_PAGE_LIMIT_MAX = 50;
export const TIMELINE_IMAGES_MAX = 9;
/** Max accepted upload size, in bytes (8 MiB). */
export const TIMELINE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
/** Content types the upload endpoint accepts. */
export const TIMELINE_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;
export type TimelineImageContentType = (typeof TIMELINE_IMAGE_CONTENT_TYPES)[number];

/** Extension used on disk / in the served url for each accepted content type. */
export const TIMELINE_IMAGE_EXTENSIONS: Record<TimelineImageContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

// ── Image reference ───────────────────────────────────────────────────────────
/**
 * A relative url the server issued from `POST /timeline/images`, e.g.
 * `/uploads/9f0c….jpg`. The pattern is deliberately strict: the create endpoint
 * only stores urls that match it (name = uuid-ish + known extension), so a
 * client can never inject an arbitrary path or absolute URL into a post.
 */
export const timelineImageUrlSchema = z
  .string()
  .regex(/^\/uploads\/[A-Za-z0-9_-]+\.[a-z0-9]+$/, "must be an uploaded image url");

export const timelineImageSchema = z.object({ url: timelineImageUrlSchema });
export type TimelineImage = z.infer<typeof timelineImageSchema>;

// ── Requests ──────────────────────────────────────────────────────────────────
export const timelineTextSchema = z.string().trim().max(TIMELINE_TEXT_MAX);

/**
 * Query for the list endpoint (infinite scroll). `cursor` is the opaque token
 * the previous page returned in `nextCursor`; omit it for the first (newest)
 * page. A malformed cursor is `INVALID_REQUEST`.
 */
export const listTimelineQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(TIMELINE_PAGE_LIMIT_MAX)
    .optional()
    .default(TIMELINE_PAGE_LIMIT_DEFAULT),
});
export type ListTimelineQuery = z.infer<typeof listTimelineQuerySchema>;

/** Create a post — at least one of text / images must be present. */
export const createTimelinePostSchema = z
  .object({
    text: timelineTextSchema.optional().default(""),
    images: z.array(timelineImageSchema).max(TIMELINE_IMAGES_MAX).optional().default([]),
  })
  .refine((v) => v.text.length > 0 || v.images.length > 0, {
    message: "a post needs text or at least one image",
  });
export type CreateTimelinePostInput = z.infer<typeof createTimelinePostSchema>;

// ── DTO ─────────────────────────────────────────────────────────────────────
export interface TimelinePostDTO {
  id: string;
  text: string;
  images: TimelineImage[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/** Result of a successful image upload. */
export interface TimelineImageDTO {
  url: string; // relative, e.g. /uploads/<name>
  contentType: TimelineImageContentType;
}

// ── Error codes (stable, client-switchable) ───────────────────────────────────
export const TIMELINE_ERROR_CODES = [
  "INVALID_REQUEST",
  "UNAUTHORIZED", // no/invalid session for a protected route
  "TIMELINE_POST_NOT_FOUND", // missing, or owned by another user
  "IMAGE_TOO_LARGE", // upload exceeded TIMELINE_IMAGE_MAX_BYTES
  "UNSUPPORTED_IMAGE_TYPE", // content type not in TIMELINE_IMAGE_CONTENT_TYPES
] as const;
export type TimelineErrorCode = (typeof TIMELINE_ERROR_CODES)[number];

export interface TimelineError {
  code: TimelineErrorCode;
  message: string;
}

// ── Responses ─────────────────────────────────────────────────────────────────
/** One page of the feed, newest first. */
export interface TimelinePostsResponse {
  ok: true;
  posts: TimelinePostDTO[];
  /**
   * Opaque token for the next (older) page — pass it back as `?cursor=`.
   * `null` means this was the last page. Clients never inspect the contents;
   * the encoding is a server implementation detail.
   */
  nextCursor: string | null;
}

export interface TimelinePostResponse {
  ok: true;
  post: TimelinePostDTO;
}

export interface TimelineImageResponse {
  ok: true;
  image: TimelineImageDTO;
}

// ── Endpoint paths (shared so SDKs never hard-code strings) ─────────────────────
export const TIMELINE_ROUTES = {
  list: "/timeline",
  create: "/timeline",
  uploadImage: "/timeline/images",
} as const;

/** Path for a single post (delete). */
export function timelinePostPath(id: string): string {
  return `/timeline/${id}`;
}

/**
 * Path for the PUBLIC single-post read that backs a share link. Unlike every
 * other timeline route this one is unauthenticated: the post `id` (a random
 * UUID) is itself the capability, exactly like the `/uploads/:name` image url.
 * Anyone with the link can read that one post; nothing else is reachable.
 */
export function timelineSharePath(id: string): string {
  return `/timeline/share/${id}`;
}

// ── App deep link (shared so every surface builds the same url) ─────────────────
/** Custom URL scheme the native clients register to receive a shared post. */
export const TIMELINE_APP_SCHEME = "infralab";

/**
 * Deep link that opens a shared post in the native app, e.g.
 * `infralab://timeline/<id>`. The h5 share landing offers this as "在 app 中查看";
 * a native client that has registered {@link TIMELINE_APP_SCHEME} handles it.
 */
export function timelineAppLink(id: string): string {
  return `${TIMELINE_APP_SCHEME}://timeline/${id}`;
}

// ── SDK interface draft (implemented per platform; iOS today) ───────────────────
/** One page of posts as the SDK surfaces it (see {@link TimelinePostsResponse}). */
export interface TimelinePage {
  posts: TimelinePostDTO[];
  nextCursor: string | null;
}

/** Options for {@link TimelineClient.list}; both default server-side. */
export interface ListTimelineOptions {
  cursor?: string;
  limit?: number;
}

/**
 * The shape a platform SDK implements. Transport mirrors {@link TodoClient}:
 * native sends `Authorization: Bearer`; web would ride the session cookie.
 */
export interface TimelineClient {
  /** Fetch one page; call again with the returned `nextCursor` until it is null. */
  list(options?: ListTimelineOptions): Promise<TimelinePage>;
  uploadImage(bytes: Uint8Array, contentType: TimelineImageContentType): Promise<TimelineImageDTO>;
  create(input: CreateTimelinePostInput): Promise<TimelinePostDTO>;
  remove(id: string): Promise<void>;
  /**
   * Read a single post by id through the PUBLIC share endpoint (no auth). Backs
   * the h5 share landing; throws {@link HttpAuthError} `TIMELINE_POST_NOT_FOUND`
   * when the id is unknown.
   */
  getShared(id: string): Promise<TimelinePostDTO>;
}
