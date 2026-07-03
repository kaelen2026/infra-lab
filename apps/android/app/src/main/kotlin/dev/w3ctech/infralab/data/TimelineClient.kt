package dev.w3ctech.infralab.data

import dev.w3ctech.infralab.data.contracts.TimelineImage
import dev.w3ctech.infralab.data.contracts.TimelineImageContentType
import dev.w3ctech.infralab.data.contracts.TimelinePage
import dev.w3ctech.infralab.data.contracts.TimelinePostDTO

/**
 * The shape every platform SDK implements for the timeline feature (mirrors the shared
 * `TimelineClient` interface and the iOS `TimelineClient` protocol). Transport mirrors [TodoClient]:
 * native sends `Authorization: Bearer <accessToken>`. Calls throw [TimelineException] on a non-2xx.
 */
interface TimelineClient {
    /**
     * Fetch one page, newest first. [cursor] is the previous page's `nextCursor` (null ⇒ first
     * page); [limit] of null uses the server's default page size.
     */
    suspend fun list(cursor: String? = null, limit: Int? = null): TimelinePage

    /** Upload one image; returns the reference to attach to a post. */
    suspend fun uploadImage(bytes: ByteArray, contentType: TimelineImageContentType): TimelineImage

    suspend fun create(text: String, images: List<TimelineImage>): TimelinePostDTO

    suspend fun remove(id: String)
}
