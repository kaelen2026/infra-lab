import SwiftUI

/// Holds the user's ``ThemePreference`` and persists it across launches.
///
/// Appearance is a non-secret UI setting, so it lives in `UserDefaults` — the
/// Keychain (``TokenStore``) is reserved for credentials. Injecting the
/// `UserDefaults` instance keeps the store testable with an isolated suite.
@MainActor
final class AppearanceStore: ObservableObject {
    private static let key = "appearance.themePreference"
    private let defaults: UserDefaults

    /// Writing the preference persists it immediately. The `didSet` does not
    /// fire during `init`, so first launch reads the default without a write-back.
    @Published var preference: ThemePreference {
        didSet { defaults.set(preference.rawValue, forKey: Self.key) }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let raw = defaults.string(forKey: Self.key)
        preference = raw.flatMap(ThemePreference.init(rawValue:)) ?? .system
    }
}
