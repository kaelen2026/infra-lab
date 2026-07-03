package dev.w3ctech.infralab.data

import dev.w3ctech.infralab.data.contracts.ApiErrorBody
import dev.w3ctech.infralab.data.contracts.AuthErrorCode
import kotlinx.serialization.json.Json

/**
 * Typed failure carrying the API's stable error code (mirrors the web SDK's `HttpAuthError`).
 * [code] is null for transport/unknown failures the UI should treat as "network error".
 */
class AuthException(
    val code: AuthErrorCode?,
    val status: Int,
    message: String?,
    /** Seconds until the client may retry (cooldown / lock windows). */
    val retryAfter: Int? = null,
    /** Remaining verify attempts before lockout, when applicable. */
    val remainingAttempts: Int? = null,
) : Exception(message)

/** Decodes a non-2xx response body into an [AuthException]. Tolerant of malformed/empty bodies. */
object AuthErrorParser {
    private val json = Json { ignoreUnknownKeys = true }

    fun parse(status: Int, body: String?): AuthException {
        val parsed = body?.takeIf { it.isNotBlank() }?.let {
            runCatching { json.decodeFromString<ApiErrorBody>(it) }.getOrNull()
        }
        return AuthException(
            code = parsed?.code,
            status = status,
            message = parsed?.message,
            retryAfter = parsed?.retryAfter,
            remainingAttempts = parsed?.remainingAttempts,
        )
    }
}
