import Foundation

/// Loads the current user's devices + login history for the account screen —
/// the Swift counterpart of web's `useAccountData` hook. All state mutates on
/// the main actor.
@MainActor
final class AccountViewModel: ObservableObject {
    @Published private(set) var devices: [DeviceDTO]?
    @Published private(set) var events: [LoginEventDTO]?
    @Published private(set) var error: String?

    private let client: AuthClient

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
}
