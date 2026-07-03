package dev.w3ctech.infralab.data.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Kotlin mirror of `packages/shared/src/contracts/auth.ts` — the single source of truth shared by
 * the API and every client SDK. Keep these shapes in lock-step with the TypeScript contracts:
 * request/response DTOs, error codes, limits, route paths and the platform enum.
 */

// ── Platforms ────────────────────────────────────────────────────────────────
@Serializable
enum class Platform {
    @SerialName("web")
    WEB,

    @SerialName("ios")
    IOS,

    @SerialName("android")
    ANDROID,

    @SerialName("harmony")
    HARMONY,
}

// ── Limits (mirrors the OTP service config; the UI uses these for hints) ───────
object OtpLimits {
    const val CODE_LENGTH = 6
    const val TTL_SECONDS = 300 // 5 minutes
    const val RESEND_COOLDOWN_SECONDS = 60
    const val DAILY_PER_PHONE = 10
    const val HOURLY_PER_IP = 30
    const val MAX_ATTEMPTS = 5
    const val LOCK_SECONDS = 600 // 10 minutes
}

// ── Stable error codes (kept identical to AUTH_ERROR_CODES) ────────────────────
@Serializable
enum class AuthErrorCode {
    INVALID_REQUEST,
    RESEND_COOLDOWN,
    DAILY_LIMIT_EXCEEDED,
    IP_LIMIT_EXCEEDED,
    LOCKED,
    CODE_EXPIRED,
    INVALID_CODE,
    UNAUTHORIZED,
    INVALID_REFRESH_TOKEN,
    QR_NOT_FOUND,
    QR_ALREADY_USED,
    QR_NOT_APPROVED,
}

// ── Endpoint paths (kept identical to AUTH_ROUTES) ─────────────────────────────
object AuthRoutes {
    const val REQUEST_OTP = "/auth/otp/request"
    const val VERIFY_OTP = "/auth/otp/verify"
    const val REFRESH = "/auth/refresh"
    const val LOGOUT = "/auth/logout"
    const val ME = "/auth/me"
    const val DEVICES = "/auth/devices"
    const val LOGIN_EVENTS = "/auth/login-events"
}

// ── Requests ───────────────────────────────────────────────────────────────────
@Serializable
data class RequestOtpRequest(
    val phone: String,
    val platform: Platform,
)

@Serializable
data class DeviceInfo(
    val platform: Platform,
    /** Stable per-install identifier supplied by the client. */
    val deviceId: String,
    val model: String? = null,
    val osVersion: String? = null,
    val appVersion: String? = null,
    val pushToken: String? = null,
)

@Serializable
data class VerifyOtpRequest(
    val phone: String,
    val code: String,
    val platform: Platform,
    val device: DeviceInfo? = null,
)

@Serializable
data class RefreshRequest(
    val refreshToken: String,
)

// ── Responses ───────────────────────────────────────────────────────────────────
@Serializable
data class RequestOtpResponse(
    val ok: Boolean = true,
    val ttlSeconds: Int,
    val resendAfterSeconds: Int,
    /** Present only when OTP_DEBUG_RETURN_CODE is on (dev). Never in production. */
    val debugCode: String? = null,
)

@Serializable
data class AuthUser(
    val id: String,
    val phone: String,
    val displayName: String? = null,
    val avatarUrl: String? = null,
    val createdAt: String,
    /** True when this verification just created the account. */
    val isNew: Boolean = false,
)

@Serializable
data class AuthTokens(
    val accessToken: String,
    /** Seconds until accessToken expiry. */
    val accessTokenExpiresIn: Int,
    val refreshToken: String,
    val refreshTokenExpiresIn: Int,
    val tokenType: String = "Bearer",
)

@Serializable
data class VerifyOtpResponse(
    val ok: Boolean = true,
    val user: AuthUser,
    /** Native platforms receive Bearer tokens here; web omits them (cookie session). */
    val tokens: AuthTokens? = null,
)

@Serializable
data class RefreshResponse(
    val ok: Boolean = true,
    val tokens: AuthTokens,
)

@Serializable
data class MeResponse(
    val ok: Boolean = true,
    val user: AuthUser,
)

// ── Account dashboard: devices & login history ─────────────────────────────────
/** A registered client install for the current user (mirrors the shared `DeviceDTO`). */
@Serializable
data class DeviceDTO(
    val id: String,
    val platform: Platform,
    val deviceId: String,
    val model: String? = null,
    val osVersion: String? = null,
    val appVersion: String? = null,
    val lastSeenAt: String,
    val createdAt: String,
)

@Serializable
data class DevicesResponse(
    val ok: Boolean = true,
    val devices: List<DeviceDTO>,
)

/** A single OTP verification attempt in the audit trail (mirrors the shared `LoginEventDTO`). */
@Serializable
data class LoginEventDTO(
    val id: String,
    val platform: Platform,
    val ip: String? = null,
    val success: Boolean,
    /** Failure reason (auth error code) for `success: false`; null on success. */
    val reason: String? = null,
    val createdAt: String,
)

@Serializable
data class LoginEventsResponse(
    val ok: Boolean = true,
    val events: List<LoginEventDTO>,
)

/** Error envelope: the API returns `{ ok: false, code, message?, retryAfter?, remainingAttempts? }`. */
@Serializable
data class ApiErrorBody(
    val ok: Boolean = false,
    val code: AuthErrorCode? = null,
    val message: String? = null,
    val retryAfter: Int? = null,
    val remainingAttempts: Int? = null,
)
