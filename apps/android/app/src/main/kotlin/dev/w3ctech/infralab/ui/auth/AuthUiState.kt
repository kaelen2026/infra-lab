package dev.w3ctech.infralab.ui.auth

import dev.w3ctech.infralab.data.contracts.AuthUser

/** The three-step OTP flow, matching the web auth page. */
enum class AuthStep { PHONE, CODE, DONE }

/**
 * Immutable view-model state the UI renders directly (mirrors the web `OtpLogin` view-model).
 * Derived flags ([canSend] etc.) are computed here so the composables stay dumb.
 */
data class AuthUiState(
    val step: AuthStep = AuthStep.PHONE,
    val phone: String = OtpInput.DEFAULT_PHONE_PREFIX,
    val code: String = "",
    val busy: Boolean = false,
    val error: String? = null,
    /** Seconds left before the code may be resent (0 ⇒ allowed). */
    val cooldown: Int = 0,
    /** The signed-in user once authenticated (drives the account dashboard). */
    val user: AuthUser? = null,
    /** True while the launch-time session restore is in flight. */
    val restoring: Boolean = true,
) {
    val canSend: Boolean get() = !busy && OtpInput.canSend(phone)
    val canVerify: Boolean get() = !busy && OtpInput.canVerify(code)
    val canResend: Boolean get() = !busy && cooldown <= 0

    /** Resolved name shown after a successful login (name, falling back to the phone). */
    val displayName: String? get() = user?.let { it.displayName ?: it.phone }
}
