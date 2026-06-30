import SwiftUI

/// App entry point. Wires the production stack — Keychain-backed token store +
/// URLSession auth client against the dev API — into a single ``AuthViewModel``.
@main
struct InfraAuthApp: App {
    @StateObject private var auth: AuthViewModel

    init() {
        let store = KeychainTokenStore()
        let client = HTTPAuthClient(baseURL: AppConfig.apiBaseURL, platform: .ios, store: store)
        _auth = StateObject(wrappedValue: AuthViewModel(client: client))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
        }
    }
}
