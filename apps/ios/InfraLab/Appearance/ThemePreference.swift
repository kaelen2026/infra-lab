import SwiftUI

/// User-selectable app appearance. `system` defers to the device setting;
/// `light` / `dark` force a scheme regardless of the system. Persisted across
/// launches by ``AppearanceStore``; applied at the app root via
/// `preferredColorScheme`. The concrete colors still come from the shared
/// ``DesignTokens`` (which already resolve light/dark per trait collection) —
/// this only chooses which trait the app runs under.
enum ThemePreference: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    /// The SwiftUI scheme to force, or `nil` to follow the system.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }

    /// Label shown in the appearance picker.
    var label: String {
        switch self {
        case .system: return "跟随系统"
        case .light: return "浅色"
        case .dark: return "深色"
        }
    }
}
