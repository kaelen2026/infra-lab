import UIKit

/// Minimal `UIApplicationDelegate` attached via `@UIApplicationDelegateAdaptor` so a
/// pure-SwiftUI app can still receive the APNS remote-notification callbacks. It only
/// bridges the device-token lifecycle into ``PushRegistration``; all reporting/state
/// lives there. No token is ever logged (see .claude/rules/ios.md).
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        Task { await PushRegistration.shared.requestAuthorizationAndRegister() }
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in PushRegistration.shared.handleDeviceToken(deviceToken) }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Expected on the simulator (no APNS) or without the push entitlement; the
        // app runs fine without push, so swallow rather than crash. Not logged to
        // avoid any chance of leaking identifiers to the device console.
    }
}
