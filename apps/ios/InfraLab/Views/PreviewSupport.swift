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

    func signInWithApple(idToken: String, nonce: String?, device: DeviceInfo?) async throws -> AuthUser {
        .preview
    }

    func refresh() async throws -> AuthTokens? { nil }
    func me() async throws -> AuthUser { .preview }
    func updateProfile(displayName: String) async throws -> AuthUser { .preview }
    func uploadAvatar(_ data: Data, contentType: TimelineImageContentType) async throws -> AuthUser {
        .preview
    }
    func listDevices() async throws -> [DeviceDTO] { [.preview] }
    func updatePushToken(deviceId: String, pushToken: String) async throws {}
    func listLoginEvents() async throws -> [LoginEventDTO] { [.previewSuccess, .previewFailure] }
    func approveQrLogin(ticketId: String) async throws {}
    func logout() async throws {}
}

/// Canned ``TodoClient`` for SwiftUI previews — no network, deterministic data.
final class PreviewTodoClient: TodoClient {
    func list() async throws -> [TodoDTO] { [.preview(1, false), .preview(2, true)] }
    func create(title: String) async throws -> TodoDTO { .preview(99, false, title: title) }
    func update(id: String, patch: UpdateTodoInput) async throws -> TodoDTO {
        .preview(1, patch.completed ?? false)
    }
    func toggle(id: String, completed: Bool) async throws -> TodoDTO { .preview(1, completed) }
    func remove(id: String) async throws {}
}

/// Canned ``TimelineClient`` for SwiftUI previews — no network, deterministic data.
final class PreviewTimelineClient: TimelineClient {
    func list(cursor: String?, limit: Int?) async throws -> TimelinePage {
        TimelinePage(
            posts: [.preview(1, imageCount: 0), .preview(2, imageCount: 2)],
            nextCursor: nil
        )
    }
    func uploadImage(_ data: Data, contentType: TimelineImageContentType) async throws -> TimelineImage {
        TimelineImage(url: "/uploads/preview.jpg")
    }
    func create(text: String, images: [TimelineImage]) async throws -> TimelinePostDTO {
        .preview(99, text: text, imageCount: images.count)
    }
    func remove(id: String) async throws {}
    func getShared(id: String) async throws -> TimelinePostDTO { .preview(1, imageCount: 2) }
}

/// Canned ``HealthClient`` for SwiftUI previews — returns a fixed status, no network.
final class PreviewHealthClient: HealthClient {
    private let status: ServerStatus
    init(_ status: ServerStatus) { self.status = status }
    func probe() async -> ServerStatus { status }
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

extension DeviceDTO {
    static let preview = DeviceDTO(
        id: "d1", platform: .ios, deviceId: "device-1", model: "iPhone",
        osVersion: "17.0", appVersion: "0.1.0",
        lastSeenAt: "2026-07-01T09:30:00.000Z", createdAt: "2026-06-30T00:00:00.000Z"
    )
}

extension LoginEventDTO {
    static let previewSuccess = LoginEventDTO(
        id: "e1", platform: .ios, ip: "203.0.113.7", success: true,
        createdAt: "2026-07-01T09:30:00.000Z"
    )
    static let previewFailure = LoginEventDTO(
        id: "e2", platform: .web, ip: nil, success: false,
        createdAt: "2026-06-30T22:10:00.000Z"
    )
}

extension TodoDTO {
    static func preview(_ index: Int, _ completed: Bool, title: String? = nil) -> TodoDTO {
        TodoDTO(
            id: "t\(index)", title: title ?? "示例待办 \(index)", completed: completed,
            createdAt: "2026-07-01T09:30:00.000Z", updatedAt: "2026-07-01T09:30:00.000Z",
            completedAt: completed ? "2026-07-01T10:00:00.000Z" : nil
        )
    }
}

extension TimelinePostDTO {
    static func preview(_ index: Int, text: String? = nil, imageCount: Int) -> TimelinePostDTO {
        TimelinePostDTO(
            id: "p\(index)",
            text: text ?? "示例动态 \(index):今天写了一段代码。",
            images: (0..<imageCount).map { TimelineImage(url: "/uploads/preview-\(index)-\($0).jpg") },
            createdAt: "2026-07-01T09:30:00.000Z",
            updatedAt: "2026-07-01T09:30:00.000Z"
        )
    }
}
#endif
