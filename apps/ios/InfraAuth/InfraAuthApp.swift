import SwiftUI

/// App entry point. Wires the production stack — a Keychain-backed token store
/// shared by a URLSession auth client and todo client against the dev API — into
/// the auth, account and todo view models.
@main
struct InfraAuthApp: App {
    @StateObject private var auth: AuthViewModel
    @StateObject private var account: AccountViewModel
    @StateObject private var todos: TodoViewModel

    init() {
        let store = KeychainTokenStore()
        let authClient = HTTPAuthClient(baseURL: AppConfig.apiBaseURL, platform: .ios, store: store)
        let todoClient = HTTPTodoClient(baseURL: AppConfig.apiBaseURL, store: store)
        _auth = StateObject(wrappedValue: AuthViewModel(client: authClient))
        _account = StateObject(wrappedValue: AccountViewModel(client: authClient))
        _todos = StateObject(wrappedValue: TodoViewModel(client: todoClient))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(account)
                .environmentObject(todos)
        }
    }
}
