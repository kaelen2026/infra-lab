import AppKit
import UserNotifications

/// Owns the APNS registration lifecycle: it asks the user for notification
/// permission, registers for remote notifications, and holds the latest device
/// token (as lowercase hex). The token arrives asynchronously via the app delegate,
/// so a reporter closure (set once the auth client exists) forwards it to the API
/// whenever it changes — the server treats an update for an unregistered device as a
/// no-op, so calling it before login is harmless.
///
/// Secrets rule (see .claude/rules/ios.md): the token is never logged with `print`.
@MainActor
final class PushRegistration: ObservableObject {
    static let shared = PushRegistration()
    private init() {}

    /// Lowercase-hex APNS device token, or nil until registration succeeds.
    @Published private(set) var deviceToken: String?

    private var reporter: ((String) async -> Void)?

    /// Request notification authorization and, if granted, register for remote
    /// notifications. Safe to call every launch — the system remembers the choice.
    func requestAuthorizationAndRegister() async {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
        guard granted else { return }
        NSApplication.shared.registerForRemoteNotifications()
    }

    /// Called from the app delegate when APNS hands us the raw token bytes.
    func handleDeviceToken(_ data: Data) {
        let hex = data.map { String(format: "%02x", $0) }.joined()
        deviceToken = hex
        if let reporter {
            Task { await reporter(hex) }
        }
    }

    /// Register the sink that ships a fresh token to the API (invoked on the main
    /// actor). If a token already arrived before the reporter was set, flush it now.
    func onToken(_ handler: @escaping (String) async -> Void) {
        reporter = handler
        if let deviceToken {
            Task { await handler(deviceToken) }
        }
    }
}
