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
    /// Stable error code → user-facing copy, sourced from the generated
    /// ``AuthCopy/Errors`` so the wording stays identical across every client
    /// (web / iOS / android / harmony). Do not inline strings here.
    var displayMessage: String {
        guard case let .http(_, code, _, _, remainingAttempts) = self else {
            return AuthCopy.Errors.network
        }
        let base = AuthCopy.Errors.message(for: code)
        if code == .invalidCode, let remaining = remainingAttempts {
            return AuthCopy.Errors.invalidCodeRemaining(base: base, remaining: remaining)
        }
        return base
    }
}
