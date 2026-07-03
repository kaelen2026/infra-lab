package dev.w3ctech.infralab.ui.auth

import dev.w3ctech.infralab.data.contracts.OtpLimits

/**
 * Pure input normalization/validation, kept free of Android types so it is unit-testable
 * (mirrors the edge-normalization in the web `useOtpLogin` hook).
 */
object OtpInput {
    const val DEFAULT_PHONE_PREFIX = "+86"

    fun normalizePhone(value: String): String = value.trim()

    fun normalizeCode(value: String): String =
        value.filter(Char::isDigit).take(OtpLimits.CODE_LENGTH)

    /** Loose client-side gate before hitting the server's strict E.164 check. */
    fun canSend(phone: String): Boolean = phone.count(Char::isDigit) >= 8

    fun canVerify(code: String): Boolean = code.length == OtpLimits.CODE_LENGTH
}
