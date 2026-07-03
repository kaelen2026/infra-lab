package dev.w3ctech.infralab.data

import dev.w3ctech.infralab.data.contracts.TimelineErrorCode
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Typed failure for a timeline request carrying the API's stable [TimelineErrorCode] (mirrors
 * [TodoException]). The timeline UI collapses every failure to a generic message — like the todo
 * client — so [code] is informational only.
 */
class TimelineException(
    val code: TimelineErrorCode?,
    val status: Int,
    message: String?,
) : Exception(message)

/** Error envelope: the API returns `{ ok: false, code, message? }`. */
@Serializable
private data class TimelineErrorBody(
    val code: TimelineErrorCode? = null,
    val message: String? = null,
)

/** Decodes a non-2xx timeline response body into a [TimelineException]. Tolerant of malformed bodies. */
object TimelineErrorParser {
    private val json = Json { ignoreUnknownKeys = true }

    fun parse(status: Int, body: String?): TimelineException {
        val parsed = body?.takeIf { it.isNotBlank() }?.let {
            runCatching { json.decodeFromString<TimelineErrorBody>(it) }.getOrNull()
        }
        return TimelineException(code = parsed?.code, status = status, message = parsed?.message)
    }
}
