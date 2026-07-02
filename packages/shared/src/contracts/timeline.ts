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
export interface TimelinePostsResponse {
  ok: true;
  posts: TimelinePostDTO[];
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

// ── SDK interface draft (implemented per platform; iOS today) ───────────────────
/**
 * The shape a platform SDK implements. Transport mirrors {@link TodoClient}:
 * native sends `Authorization: Bearer`; web would ride the session cookie.
 */
export interface TimelineClient {
  list(): Promise<TimelinePostDTO[]>;
  uploadImage(bytes: Uint8Array, contentType: TimelineImageContentType): Promise<TimelineImageDTO>;
  create(input: CreateTimelinePostInput): Promise<TimelinePostDTO>;
  remove(id: string): Promise<void>;
}
