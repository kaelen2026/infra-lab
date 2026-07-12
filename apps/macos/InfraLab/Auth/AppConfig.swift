import Foundation

/// App-wide configuration. The API base URL defaults to the local dev server
/// (`http://localhost:3001`, matching `apps/api`) and can be overridden with an
/// `API_BASE_URL` entry in Info.plist for staging/prod builds.
enum AppConfig {
    static let apiBaseURL: URL = {
        // The key is always present (build-setting substitution); an unset
        // API_URL leaves it empty, which must fall through to localhost.
        if let raw = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
           !raw.isEmpty,
           let url = URL(string: raw) {
            return url
        }
        guard let fallback = URL(string: "http://localhost:3001") else {
            preconditionFailure("constant localhost url must parse")
        }
        return fallback
    }()

    /// Origin of the h5 share landing (`/t/:id`) that a post's share sheet hands
    /// out. Defaults to the h5 dev server (`apps/h5`, :3002); staging/prod builds
    /// override it via `SHARE_BASE_URL`, same mechanism as `API_BASE_URL`.
    static let shareBaseURL: URL = {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "SHARE_BASE_URL") as? String,
           !raw.isEmpty,
           let url = URL(string: raw) {
            return url
        }
        guard let fallback = URL(string: "http://localhost:3002") else {
            preconditionFailure("constant localhost url must parse")
        }
        return fallback
    }()
}

/// Google Sign-In availability, the iOS counterpart of web's
/// `NEXT_PUBLIC_GOOGLE_ENABLED` and h5's `VITE_GOOGLE_ENABLED`: the button is shown
/// only when an OAuth iOS client id is configured. The id is substituted into
/// Info.plist's `GIDClientID` from the `GID_CLIENT_ID` build setting (empty by
/// default), so an unconfigured build hides the button, injects the
/// ``UnavailableGoogleSignInProvider`` and still builds / runs / tests. No real id
/// is ever committed — pass it at build time (see project.yml).
enum GoogleConfig {
    /// The configured OAuth iOS client id, or `nil` when the Info.plist value is
    /// absent or empty (the committed default).
    static var clientID: String? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String else {
            return nil
        }
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// True when a client id is present — gates both the button and the real adapter.
    static var isEnabled: Bool { clientID != nil }
}

/// Collects this install's device metadata for the `device` field of
/// `/auth/otp/verify`. macOS has no `UIDevice`, so the OS version comes from
/// `ProcessInfo` and the `deviceId` is a per-install UUID persisted in
/// `UserDefaults` (a device id is not a secret, so it does not need the Keychain).
enum DeviceMetadata {
    private static let deviceIdKey = "infra.device.id"

    @MainActor
    static func current(pushToken: String? = nil) -> DeviceInfo {
        DeviceInfo(
            platform: .macos,
            deviceId: stableDeviceId(),
            model: "Mac",
            osVersion: osVersionString(),
            appVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
            pushToken: pushToken
        )
    }

    /// `ProcessInfo`'s OS version rendered as `"14.5.0"`, matching the dotted form
    /// `UIDevice.systemVersion` produced on iOS.
    private static func osVersionString() -> String {
        let version = ProcessInfo.processInfo.operatingSystemVersion
        return "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)"
    }

    /// The stable per-install id used both as the `device` row key and the push-token
    /// update target, so a token reported after login lands on the row created at verify.
    /// macOS has no `identifierForVendor`, so we mint one UUID on first use and persist it.
    @MainActor
    static func stableDeviceId() -> String {
        if let stored = UserDefaults.standard.string(forKey: deviceIdKey) {
            return stored
        }
        let id = UUID().uuidString
        UserDefaults.standard.set(id, forKey: deviceIdKey)
        return id
    }
}
