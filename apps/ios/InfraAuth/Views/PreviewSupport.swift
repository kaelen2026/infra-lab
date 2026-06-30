#if DEBUG
import Foundation

/// Canned ``AuthClient`` for SwiftUI previews — no network, deterministic data.
final class PreviewAuthClient: AuthClient {
    func requestOtp(phone: String) async throws -> RequestOtpResponse {
        RequestOtpResponse(ok: true, ttlSeconds: 300, resendAfterSeconds: 60, debugCode: "123456")
    }

    func verifyOtp(phone: String, code: String, device: DeviceInfo?) async throws -> VerifyOtpResponse {
        VerifyOtpResponse(ok: true, user: .preview, tokens: nil)
    }

    func refresh() async throws -> AuthTokens? { nil }
    func me() async throws -> AuthUser { .preview }
    func logout() async throws {}
}

extension AuthUser {
    static let preview = AuthUser(
        id: "preview",
        phone: "+8613800138000",
        displayName: "138****8000",
        avatarUrl: nil,
        createdAt: "2026-06-30T00:00:00.000Z",
        isNew: true
    )
}
#endif
