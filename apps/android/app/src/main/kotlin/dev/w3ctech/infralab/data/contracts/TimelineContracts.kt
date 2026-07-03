package dev.w3ctech.infralab.data.contracts

import kotlinx.serialization.Serializable

/**
 * Kotlin mirror of `packages/shared/src/contracts/timeline.ts` — a per-user feed of posts carrying
 * text and/or uploaded images. Mirrors the todo contracts (single source of truth for the wire
 * shapes, error codes and limits); keep field names in lock-step with the TypeScript contracts (the
 * server emits camelCase JSON). Every post is scoped to the authenticated user; the transport rides
 * the same Bearer token as the auth calls.
 *
 * Image flow is two steps so a large binary never rides inside a JSON body:
 *   1. `POST /timeline/images` (multipart) → returns a `{ url }` the server issued.
 *   2. `POST /timeline` (JSON) → references those urls in `images`.
 */

// ── Limits (shared so client and server agree before a byte is sent) ────────────
object TimelineLimits {
    const val MAX_TEXT_LENGTH = 2000
    const val MAX_IMAGES = 9

    /** Page size the list endpoint uses when the client sends no `limit`. */
    const val PAGE_LIMIT_DEFAULT = 20

    /** Max accepted upload size, in bytes (8 MiB). */
    const val IMAGE_MAX_BYTES = 8L * 1024 * 1024
}

/** Pure input normalization (trim + clamp), matching `timelineTextSchema` before sending. */
object TimelineInput {
    fun normalizeText(raw: String): String =
        raw.trim().take(TimelineLimits.MAX_TEXT_LENGTH)
}

/**
 * Content types the upload endpoint accepts (mirrors `TIMELINE_IMAGE_CONTENT_TYPES`). A picked
 * image whose MIME is outside this set is dropped before upload — the server would reject it as
 * `UNSUPPORTED_IMAGE_TYPE`.
 */
enum class TimelineImageContentType(val mime: String, val fileExtension: String) {
    JPEG("image/jpeg", "jpg"),
    PNG("image/png", "png"),
    WEBP("image/webp", "webp"),
    HEIC("image/heic", "heic"),
    ;

    companion object {
        /** Resolve a MIME string to a supported content type, or null when unsupported. */
        fun fromMime(mime: String?): TimelineImageContentType? =
            entries.firstOrNull { it.mime.equals(mime, ignoreCase = true) }
    }
}

// ── Stable error codes (kept identical to TIMELINE_ERROR_CODES) ─────────────────
@Serializable
enum class TimelineErrorCode {
    INVALID_REQUEST,
    UNAUTHORIZED,
    TIMELINE_POST_NOT_FOUND,
    IMAGE_TOO_LARGE,
    UNSUPPORTED_IMAGE_TYPE,
}

// ── Endpoint paths (kept identical to TIMELINE_ROUTES) ──────────────────────────
object TimelineRoutes {
    const val LIST = "/timeline"
    const val CREATE = "/timeline"
    const val UPLOAD_IMAGE = "/timeline/images"

    /** Path for a single post (delete). */
    fun item(id: String): String = "/timeline/$id"
}

// ── Image reference ─────────────────────────────────────────────────────────────
/** A relative url the server issued from `POST /timeline/images`, e.g. `/uploads/<name>.jpg`. */
@Serializable
data class TimelineImage(
    val url: String,
)

// ── Requests ─────────────────────────────────────────────────────────────────────
/** Create a post — at least one of text / images must be present (enforced by the caller). */
@Serializable
data class CreateTimelinePostRequest(
    val text: String,
    val images: List<TimelineImage>,
)

// ── DTO / responses ──────────────────────────────────────────────────────────────
@Serializable
data class TimelinePostDTO(
    val id: String,
    val text: String,
    val images: List<TimelineImage> = emptyList(),
    val createdAt: String,
    val updatedAt: String,
)

/** Result of a successful image upload (the server also returns `contentType`, unused here). */
@Serializable
data class TimelineImageDTO(
    val url: String,
)

@Serializable
data class TimelinePostsResponse(
    val ok: Boolean = true,
    val posts: List<TimelinePostDTO>,
    /** Opaque token for the next (older) page; null when this was the last page. */
    val nextCursor: String? = null,
)

@Serializable
data class TimelinePostResponse(
    val ok: Boolean = true,
    val post: TimelinePostDTO,
)

@Serializable
data class TimelineImageResponse(
    val ok: Boolean = true,
    val image: TimelineImageDTO,
)

/** One page of the feed as the client consumes it (mirrors `TimelinePage`). */
data class TimelinePage(
    val posts: List<TimelinePostDTO>,
    /** Pass back as `?cursor=` to fetch the next (older) page; null ⇒ exhausted. */
    val nextCursor: String?,
)
