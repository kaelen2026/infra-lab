package dev.w3ctech.infralab.data.contracts

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * Kotlin mirror of `packages/shared/src/contracts/auth.ts` — the single source of truth shared by
 * the API and every client SDK. Keep these shapes in lock-step with the TypeScript contracts:
 * request/response DTOs, error codes, limits, route paths and the platform enum.
 */

// ── Platforms ────────────────────────────────────────────────────────────────
/**
 * Mirrors the shared `PLATFORMS` set (web / ios / android / harmony / cli / weapp / macos). The
 * wire name is the lowercase value the server emits; [UNKNOWN] is a decode-only sentinel for a
 * `platform` a newer server ships ahead of this client. Tolerant decode via [PlatformSerializer]
 * keeps one unknown row from failing an entire devices / login-events list (the #194 class of bug).
 * This client only ever encodes its own value (`android`), so [UNKNOWN] is never sent.
 */
@Serializable(with = PlatformSerializer::class)
enum class Platform(val wireName: String) {
    WEB("web"),
    IOS("ios"),
    ANDROID("android"),
    HARMONY("harmony"),
    CLI("cli"),
    WEAPP("weapp"),
    MACOS("macos"),

    /** Decode-only sentinel for a platform this client doesn't model yet. Never encoded. */
    UNKNOWN("unknown"),
    ;

    companion object {
        /** Map a wire value to its member, falling back to [UNKNOWN] for anything unmodelled. */
        fun fromWire(wire: String): Platform = values().firstOrNull { it.wireName == wire } ?: UNKNOWN
    }
}

/** Tolerant string (de)serializer for [Platform]: unknown wire values decode to [Platform.UNKNOWN]. */
object PlatformSerializer : KSerializer<Platform> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("Platform", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: Platform) = encoder.encodeString(value.wireName)

    override fun deserialize(decoder: Decoder): Platform = Platform.fromWire(decoder.decodeString())
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
/**
 * Mirrors the shared `AUTH_ERROR_CODES` set. The member name is the wire value. [UNKNOWN] is a
 * decode-only sentinel so a code the server adds before this client is updated maps to a fallback
 * instead of throwing — see [AuthErrorCodeSerializer].
 */
@Serializable(with = AuthErrorCodeSerializer::class)
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

    // Social sign-in (Google / Apple).
    SOCIAL_PROVIDER_DISABLED,
    SOCIAL_TOKEN_INVALID,
    SOCIAL_ACCOUNT_ERROR,

    // Account linking — conflicts are rejected, never auto-merged.
    SOCIAL_ALREADY_LINKED,
    PHONE_ALREADY_LINKED,
    LAST_CREDENTIAL,

    /** Fallback for any code the server adds before this client is updated. */
    UNKNOWN,
    ;

    companion object {
        /** Map a wire value to its member, falling back to [UNKNOWN] for anything unmodelled. */
        fun fromWire(wire: String): AuthErrorCode =
            values().firstOrNull { it.name == wire } ?: UNKNOWN
    }
}

/** Tolerant string (de)serializer for [AuthErrorCode]: unknown codes decode to [AuthErrorCode.UNKNOWN]. */
object AuthErrorCodeSerializer : KSerializer<AuthErrorCode> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("AuthErrorCode", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: AuthErrorCode) = encoder.encodeString(value.name)

    override fun deserialize(decoder: Decoder): AuthErrorCode =
        AuthErrorCode.fromWire(decoder.decodeString())
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

    /** Native approve of a scanned QR login ticket (see the QR cross-device flow). */
    const val QR_APPROVE = "/auth/qr/approve"
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

/**
 * Native approve of a QR login: the scanning (already-authenticated) app sends only the public
 * ticket id decoded from the QR; its own Bearer session authenticates the approval. Mirrors
 * `approveQrLoginSchema`.
 */
@Serializable
data class ApproveQrLoginRequest(
    val ticketId: String,
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
