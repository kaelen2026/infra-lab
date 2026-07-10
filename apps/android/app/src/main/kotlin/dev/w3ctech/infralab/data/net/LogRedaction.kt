package dev.w3ctech.infralab.data.net

/**
 * Redacts sensitive JSON string fields from debug HTTP body logs.
 *
 * Defence in depth (issue #129 L4): release builds log at Level.NONE and the
 * Authorization header is already redacted, but debug builds keep Level.BODY for
 * troubleshooting — and OTP request/verify/refresh bodies carry the phone number,
 * the code and the refresh token in JSON. Those values must never reach logcat,
 * so the logging interceptor routes every line through [redact] first.
 */
internal object LogRedaction {

    private val sensitiveJsonStringFields = Regex(
        "\"(phone|code|accessToken|refreshToken|pollToken)\"\\s*:\\s*\"[^\"]*\"",
    )

    fun redact(line: String): String =
        sensitiveJsonStringFields.replace(line) { match ->
            "\"${match.groupValues[1]}\":\"<redacted>\""
        }
}
