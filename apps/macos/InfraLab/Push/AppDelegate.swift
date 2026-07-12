import AppKit
import UserNotifications

/// Minimal `NSApplicationDelegate` attached via `@NSApplicationDelegateAdaptor` so a
/// pure-SwiftUI app can still receive the APNS remote-notification callbacks. It
/// bridges the device-token lifecycle into ``PushRegistration`` and notification
/// display/taps into ``DeepLinkRouter``; all reporting/state lives there. No token
/// or payload is ever logged (see .claude/rules/ios.md).
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        UNUserNotificationCenter.current().delegate = self
        Task { await PushRegistration.shared.requestAuthorizationAndRegister() }
    }

    func application(
        _ application: NSApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in PushRegistration.shared.handleDeviceToken(deviceToken) }
    }

    func application(
        _ application: NSApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Expected without the push entitlement (ad-hoc local builds carry none); the
        // app runs fine without push, so swallow rather than crash. Not logged to
        // avoid any chance of leaking identifiers to the device console.
    }
}

extension AppDelegate: UNUserNotificationCenterDelegate {
    /// Show a push arriving while the app is foregrounded — without this the
    /// system silently drops it and the user never sees the notification.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound, .badge]
    }

    /// The user tapped a notification: route its optional `link` payload key
    /// through the shared deep-link router (a payload without one just opens
    /// the app, which is the correct default).
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let userInfo = response.notification.request.content.userInfo
        await MainActor.run { DeepLinkRouter.shared.openNotification(userInfo: userInfo) }
    }
}
