import Foundation
import UIKit

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
        return URL(string: "http://localhost:3001")!
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
        return URL(string: "http://localhost:3002")!
    }()
}

/// Collects this install's device metadata for the `device` field of
/// `/auth/otp/verify`. The `deviceId` is a stable per-install identifier:
/// `identifierForVendor`, falling back to a persisted UUID.
enum DeviceMetadata {
    private static let deviceIdKey = "infra.device.id"

    @MainActor
    static func current(pushToken: String? = nil) -> DeviceInfo {
        DeviceInfo(
            platform: .ios,
            deviceId: stableDeviceId(),
            model: UIDevice.current.model,
            osVersion: UIDevice.current.systemVersion,
            appVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
            pushToken: pushToken
        )
    }

    /// The stable per-install id used both as the `device` row key and the push-token
    /// update target, so a token reported after login lands on the row created at verify.
    @MainActor
    static func stableDeviceId() -> String {
        if let stored = UserDefaults.standard.string(forKey: deviceIdKey) {
            return stored
        }
        let id = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        UserDefaults.standard.set(id, forKey: deviceIdKey)
        return id
    }
}
