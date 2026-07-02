package ai.deeplang.infra.data

import ai.deeplang.infra.data.contracts.TodoErrorCode
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Typed failure for a todo request carrying the API's stable [TodoErrorCode] (mirrors
 * [AuthException]). The todo UI collapses every failure to a generic message — like web's
 * `useTodos`, which never branches on the code — so [code] is informational only.
 */
class TodoException(
    val code: TodoErrorCode?,
    val status: Int,
    message: String?,
) : Exception(message)

/** Error envelope: the API returns `{ ok: false, code, message? }`. */
@Serializable
private data class TodoErrorBody(
    val code: TodoErrorCode? = null,
    val message: String? = null,
)

/** Decodes a non-2xx todo response body into a [TodoException]. Tolerant of malformed bodies. */
object TodoErrorParser {
    private val json = Json { ignoreUnknownKeys = true }

    fun parse(status: Int, body: String?): TodoException {
        val parsed = body?.takeIf { it.isNotBlank() }?.let {
            runCatching { json.decodeFromString<TodoErrorBody>(it) }.getOrNull()
        }
        return TodoException(code = parsed?.code, status = status, message = parsed?.message)
    }
}
