import SwiftUI

/// App entry point. Wires the production stack — a Keychain-backed token store
/// shared by a URLSession auth client and todo client against the dev API — into
/// the auth, account and todo view models.
@main
struct InfraAuthApp: App {
    // Bridges APNS remote-notification callbacks into PushRegistration.
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    @StateObject private var auth: AuthViewModel
    @StateObject private var account: AccountViewModel
    @StateObject private var todos: TodoViewModel
    @StateObject private var timeline: TimelineViewModel
    @StateObject private var appearance = AppearanceStore()

    init() {
        let store = KeychainTokenStore()
        let authClient = HTTPAuthClient(baseURL: AppConfig.apiBaseURL, platform: .ios, store: store)
        let todoClient = HTTPTodoClient(baseURL: AppConfig.apiBaseURL, store: store)
        let timelineClient = HTTPTimelineClient(baseURL: AppConfig.apiBaseURL, store: store)
        _auth = StateObject(wrappedValue: AuthViewModel(client: authClient))
        _account = StateObject(wrappedValue: AccountViewModel(client: authClient))
        _todos = StateObject(wrappedValue: TodoViewModel(client: todoClient))
        _timeline = StateObject(wrappedValue: TimelineViewModel(client: timelineClient))

        // Ship any fresh APNS token to the API. Pre-login the request is unauthorized
        // and the update is a server-side no-op; post-login it updates this device row.
        PushRegistration.shared.onToken { token in
            let deviceId = await DeviceMetadata.stableDeviceId()
            try? await authClient.updatePushToken(deviceId: deviceId, pushToken: token)
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(account)
                .environmentObject(todos)
                .environmentObject(timeline)
                .environmentObject(appearance)
                .preferredColorScheme(appearance.preference.colorScheme)
        }
    }
}
