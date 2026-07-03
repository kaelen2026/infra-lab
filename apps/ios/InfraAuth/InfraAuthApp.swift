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
    @StateObject private var serverStatus: ServerStatusMonitor
    @StateObject private var appearance = AppearanceStore()

    init() {
        let store = KeychainTokenStore()
        let baseURL = AppConfig.apiBaseURL
        let session = URLSession.shared
        // One refresher + transport shared by every client: a 401 on any of them
        // triggers a single-flight token rotation (the refresh token rotates on
        // each use, so concurrent refreshes would revoke one another).
        let refresher = SessionRefresher(store: store) {
            try await AuthSession.rotateTokens(baseURL: baseURL, store: store, session: session)
        }
        let transport = AuthorizedTransport(store: store, session: session, refresher: refresher)

        let authClient = HTTPAuthClient(
            baseURL: baseURL, platform: .ios, store: store, transport: transport, refresher: refresher
        )
        let todoClient = HTTPTodoClient(baseURL: baseURL, transport: transport)
        let timelineClient = HTTPTimelineClient(baseURL: baseURL, transport: transport)
        let healthClient = HTTPHealthClient(baseURL: baseURL)
        _auth = StateObject(wrappedValue: AuthViewModel(client: authClient))
        _account = StateObject(wrappedValue: AccountViewModel(client: authClient))
        _todos = StateObject(wrappedValue: TodoViewModel(client: todoClient))
        _timeline = StateObject(wrappedValue: TimelineViewModel(client: timelineClient))
        _serverStatus = StateObject(wrappedValue: ServerStatusMonitor(client: healthClient))

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
                .environmentObject(serverStatus)
                .environmentObject(appearance)
                .preferredColorScheme(appearance.preference.colorScheme)
        }
    }
}
