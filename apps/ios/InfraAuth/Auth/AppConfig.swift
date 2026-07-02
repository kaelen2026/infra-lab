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

    @MainActor
    private static func stableDeviceId() -> String {
        if let stored = UserDefaults.standard.string(forKey: deviceIdKey) {
            return stored
        }
        let id = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        UserDefaults.standard.set(id, forKey: deviceIdKey)
        return id
    }
}
