import Foundation

// Swift mirror of `@infra/shared`'s auth contracts — the single source of truth
// for request/response shapes, error codes and limits shared by every client.
//
// Keep this in lockstep with `packages/shared/src/contracts/auth.ts`. The server
// emits camelCase JSON, so the default `Codable` synthesis maps 1:1 with no
// custom key strategy.

// MARK: - Platforms

enum Platform: String, Codable, Sendable {
    case web, ios, android, harmony

    /// Web authenticates via HttpOnly cookie; native platforms via Bearer tokens.
    var isCookiePlatform: Bool { self == .web }
}

// MARK: - Limits (mirrors the OTP service config; used for UX hints)

enum OTPLimits {
    static let codeLength = 6
    static let ttlSeconds = 300
    static let resendCooldownSeconds = 60
    static let dailyPerPhone = 10
    static let hourlyPerIp = 30
    static let maxAttempts = 5
    static let lockSeconds = 600
}

// MARK: - Validation

enum AuthValidation {
    /// E.164: leading `+` and 8–15 digits. Clients normalize before sending.
    /// The pattern is a constant, so compilation can only fail if it is edited;
    /// `try?` keeps the failure mode "reject every phone" instead of crashing.
    private static let phoneRegex = try? NSRegularExpression(pattern: #"^\+[1-9]\d{7,14}$"#)

    static func isValidPhone(_ phone: String) -> Bool {
        let trimmed = phone.trimmingCharacters(in: .whitespaces)
        let range = NSRange(trimmed.startIndex..., in: trimmed)
        return phoneRegex?.firstMatch(in: trimmed, range: range) != nil
    }

    static func isValidCode(_ code: String) -> Bool {
        code.count == OTPLimits.codeLength && code.allSatisfy(\.isNumber)
    }
}

// MARK: - Error codes (stable, client-switchable)

enum AuthErrorCode: String, Codable, Sendable {
    case invalidRequest = "INVALID_REQUEST"
    case resendCooldown = "RESEND_COOLDOWN"
    case dailyLimitExceeded = "DAILY_LIMIT_EXCEEDED"
    case ipLimitExceeded = "IP_LIMIT_EXCEEDED"
    case locked = "LOCKED"
    case codeExpired = "CODE_EXPIRED"
    case invalidCode = "INVALID_CODE"
    case unauthorized = "UNAUTHORIZED"
    case invalidRefreshToken = "INVALID_REFRESH_TOKEN"
    case qrNotFound = "QR_NOT_FOUND"
    case qrAlreadyUsed = "QR_ALREADY_USED"
    case qrNotApproved = "QR_NOT_APPROVED"
    /// Fallback for any code the server adds before this client is updated.
    case unknown = "UNKNOWN"

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = AuthErrorCode(rawValue: raw) ?? .unknown
    }
}

// MARK: - Requests / responses

struct RequestOtpInput: Encodable {
    let phone: String
    let platform: Platform
}

struct RequestOtpResponse: Decodable {
    let ok: Bool
    let ttlSeconds: Int
    let resendAfterSeconds: Int
    /// Present only when `OTP_DEBUG_RETURN_CODE` is on (dev). Never in production.
    let debugCode: String?
}

struct DeviceInfo: Encodable {
    let platform: Platform
    /// Stable per-install identifier supplied by the client.
    let deviceId: String
    var model: String?
    var osVersion: String?
    var appVersion: String?
    var pushToken: String?
}

struct VerifyOtpInput: Encodable {
    let phone: String
    let code: String
    let platform: Platform
    var device: DeviceInfo?
}

struct AuthUser: Codable, Identifiable, Equatable {
    let id: String
    let phone: String
    let displayName: String?
    let avatarUrl: String?
    let createdAt: String // ISO 8601
    let isNew: Bool
}

struct AuthTokens: Codable, Equatable {
    let accessToken: String
    let accessTokenExpiresIn: Int
    let refreshToken: String
    let refreshTokenExpiresIn: Int
    let tokenType: String // "Bearer"
}

struct VerifyOtpResponse: Decodable {
    let ok: Bool
    let user: AuthUser
    /// Native only — web omits tokens (session rides the HttpOnly cookie).
    let tokens: AuthTokens?
}

struct RefreshInput: Encodable {
    let refreshToken: String
}

/// Approve a scanned QR login ticket. Mirrors `approveQrLoginSchema` — the browser
/// keeps the secret pollToken, so the native app sends only the public ticket id.
struct ApproveQrLoginInput: Encodable {
    let ticketId: String
}

struct RefreshResponse: Decodable {
    let ok: Bool
    let tokens: AuthTokens
}

/// Update this device's APNS push token after login. Mirrors `updatePushTokenSchema`.
struct UpdatePushTokenInput: Encodable {
    let deviceId: String
    let pushToken: String
}

struct MeResponse: Decodable {
    let ok: Bool
    let user: AuthUser
}

// MARK: - Profile editing (display name + avatar)

/// Update the current user's profile. Mirrors `updateProfileSchema`. Fields are
/// optional (a partial update); `JSONEncoder` drops `nil`, so send only what
/// you're changing — the server leaves omitted fields untouched.
struct UpdateProfileInput: Encodable {
    var displayName: String?
    var avatarUrl: String?
}

/// Longest a user-chosen display name may be. Mirrors `DISPLAY_NAME_MAX_LENGTH`.
enum ProfileLimits {
    static let displayNameMaxLength = 50
}

/// Response to a profile update or an avatar upload: the refreshed user.
/// Mirrors `ProfileResponse`.
struct ProfileResponse: Decodable {
    let ok: Bool
    let user: AuthUser
}

// MARK: - Account dashboard: devices & login history

/// A registered client install for the current user. Mirrors `DeviceDTO`.
struct DeviceDTO: Decodable, Identifiable, Equatable {
    let id: String
    let platform: Platform
    let deviceId: String
    let model: String?
    let osVersion: String?
    let appVersion: String?
    let lastSeenAt: String // ISO 8601
    let createdAt: String // ISO 8601
}

struct DevicesResponse: Decodable {
    let ok: Bool
    let devices: [DeviceDTO]
}

/// A single OTP verification attempt in the audit trail. Mirrors `LoginEventDTO`.
struct LoginEventDTO: Decodable, Identifiable, Equatable {
    let id: String
    let platform: Platform
    let ip: String?
    let success: Bool
    let createdAt: String // ISO 8601
}

struct LoginEventsResponse: Decodable {
    let ok: Bool
    let events: [LoginEventDTO]
}

// MARK: - Endpoint paths (shared so the client never hard-codes strings)

enum AuthRoutes {
    static let requestOtp = "/auth/otp/request"
    static let verifyOtp = "/auth/otp/verify"
    static let refresh = "/auth/refresh"
    static let logout = "/auth/logout"
    static let me = "/auth/me"
    static let updateProfile = "/auth/profile"
    static let avatar = "/auth/avatar"
    static let devices = "/auth/devices"
    static let pushToken = "/auth/devices/push-token"
    static let loginEvents = "/auth/login-events"
    static let qrApprove = "/auth/qr/approve"
}
