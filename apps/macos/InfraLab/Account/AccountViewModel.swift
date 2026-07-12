import Foundation

/// Loads the current user's devices + login history for the account screen —
/// the Swift counterpart of web's `useAccountData` hook. All state mutates on
/// the main actor.
@MainActor
final class AccountViewModel: ObservableObject {
    @Published private(set) var devices: [DeviceDTO]?
    @Published private(set) var events: [LoginEventDTO]?
    @Published private(set) var error: String?
    /// True while a profile edit (rename / avatar upload) is in flight.
    @Published private(set) var editBusy = false
    /// Surfaced by the edit screen when a save fails or input is invalid.
    @Published var editError: String?

    private let client: AuthClient
    /// JPEG quality for re-encoding a picked avatar before upload (mirrors timeline).
    private let jpegQuality: CGFloat = 0.8
    /// Client-side avatar size cap, mirroring `TIMELINE_IMAGE_MAX_BYTES` (8 MiB), so
    /// an oversized image gets a precise message before it ever hits the network.
    private let maxAvatarBytes = 8 * 1024 * 1024

    init(client: AuthClient) {
        self.client = client
    }

    var loading: Bool { error == nil && (devices == nil || events == nil) }

    /// Load devices + login history concurrently.
    func load() async {
        do {
            async let devicesTask = client.listDevices()
            async let eventsTask = client.listLoginEvents()
            let (loadedDevices, loadedEvents) = try await (devicesTask, eventsTask)
            devices = loadedDevices
            events = loadedEvents
        } catch {
            self.error = "无法加载账户数据，请稍后重试。"
        }
    }

    // MARK: - Profile editing

    /// Save a new display name. Validates locally (non-empty, within the length
    /// cap) the way the server schema does, then persists. Returns the refreshed
    /// user on success (the caller pushes it into ``AuthViewModel``), nil on failure.
    func saveDisplayName(_ raw: String) async -> AuthUser? {
        let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else {
            editError = "请输入用户名"
            return nil
        }
        guard name.count <= ProfileLimits.displayNameMaxLength else {
            editError = "用户名不能超过 \(ProfileLimits.displayNameMaxLength) 个字符"
            return nil
        }
        editError = nil
        editBusy = true
        defer { editBusy = false }
        do {
            return try await client.updateProfile(displayName: name)
        } catch {
            editError = describe(error)
            return nil
        }
    }

    /// Re-encode the picked image to JPEG and upload it as the new avatar. Returns
    /// the refreshed user on success, nil on failure (with `editError` set).
    func uploadAvatar(_ image: PlatformImage) async -> AuthUser? {
        guard let data = image.jpegData(compressionQuality: jpegQuality) else {
            editError = "无法处理该图片，请换一张。"
            return nil
        }
        guard data.count <= maxAvatarBytes else {
            editError = "图片过大，请选择更小的图片。"
            return nil
        }
        editError = nil
        editBusy = true
        defer { editBusy = false }
        do {
            return try await client.uploadAvatar(data, contentType: .jpeg)
        } catch {
            editError = describe(error)
            return nil
        }
    }

    private func describe(_ error: Error) -> String {
        (error as? AuthClientError)?.displayMessage ?? AuthCopy.Errors.network
    }
}
