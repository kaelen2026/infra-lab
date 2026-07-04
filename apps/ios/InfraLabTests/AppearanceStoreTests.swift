@testable import InfraLab
import XCTest

@MainActor
final class AppearanceStoreTests: XCTestCase {
    /// Isolated defaults so the test never touches the real `.standard` suite.
    private func freshDefaults() throws -> UserDefaults {
        let suite = "AppearanceStoreTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    func testDefaultsToSystemWhenUnset() throws {
        let store = AppearanceStore(defaults: try freshDefaults())
        XCTAssertEqual(store.preference, .system)
    }

    func testPersistsAndReloadsSelection() throws {
        let defaults = try freshDefaults()

        let store = AppearanceStore(defaults: defaults)
        store.preference = .dark

        // A fresh store over the same defaults reads back the saved choice.
        let reloaded = AppearanceStore(defaults: defaults)
        XCTAssertEqual(reloaded.preference, .dark)
    }

    func testUnknownStoredValueFallsBackToSystem() throws {
        let defaults = try freshDefaults()
        defaults.set("solarized", forKey: "appearance.themePreference")

        let store = AppearanceStore(defaults: defaults)
        XCTAssertEqual(store.preference, .system)
    }

    func testColorSchemeMapping() {
        XCTAssertNil(ThemePreference.system.colorScheme)
        XCTAssertEqual(ThemePreference.light.colorScheme, .light)
        XCTAssertEqual(ThemePreference.dark.colorScheme, .dark)
    }
}
