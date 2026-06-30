import Foundation

/// Swift mirror of the SDK's `HttpAuthError` plus transport-level failures.
/// Non-2xx responses surface a stable ``AuthErrorCode`` and the retry/lockout
/// hints the server returned, so callers branch on `code` rather than strings.
enum AuthClientError: Error {
    /// The API responded with a non-2xx status carrying a typed error body.
    case http(status: Int, code: AuthErrorCode, message: String?, retryAfter: Int?, remainingAttempts: Int?)
    /// No stored tokens for an operation that requires a session.
    case notAuthenticated
    /// URLSession / connectivity failure.
    case transport(Error)
    /// Response body could not be decoded into the expected shape.
    case decoding(Error)

    var code: AuthErrorCode? {
        if case let .http(_, code, _, _, _) = self { return code }
        return nil
    }
}

/// The shape of the API's error envelope: `{ ok: false, code, message?, retryAfter?, remainingAttempts? }`.
struct AuthErrorBody: Decodable {
    let code: AuthErrorCode?
    let message: String?
    let retryAfter: Int?
    let remainingAttempts: Int?
}

extension AuthClientError {
    /// Stable error code → user-facing copy. Mirrors `apps/web/features/auth/messages.ts`
    /// so wording stays consistent across clients.
    var displayMessage: String {
        guard case let .http(_, code, _, _, remainingAttempts) = self else {
            return "网络异常,请稍后再试。"
        }
        let base: String
        switch code {
        case .invalidRequest: base = "手机号或验证码格式不正确。"
        case .resendCooldown: base = "发送过于频繁,请稍后再试。"
        case .dailyLimitExceeded: base = "今日验证码发送次数已达上限。"
        case .ipLimitExceeded: base = "当前网络发送过于频繁,请稍后再试。"
        case .locked: base = "尝试次数过多,账号已被临时锁定,请 10 分钟后重试。"
        case .codeExpired: base = "验证码已过期,请重新获取。"
        case .invalidCode: base = "验证码错误。"
        case .unauthorized, .invalidRefreshToken: base = "登录状态已失效,请重新登录。"
        case .unknown: base = "出错了,请稍后再试。"
        }
        if code == .invalidCode, let remaining = remainingAttempts {
            return "\(base)还可尝试 \(remaining) 次。"
        }
        return base
    }
}
