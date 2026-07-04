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
    @StateObject private var qrApprove: QrApproveViewModel
    @StateObject private var todos: TodoViewModel
    @StateObject private var timeline: TimelineViewModel
    @StateObject private var serverStatus: ServerStatusMonitor
    @StateObject private var appearance = AppearanceStore()
    // Deep links arrive from onOpenURL and the notification delegate; the router
    // is the shared funnel and this app observes it to present the target UI.
    @StateObject private var deepLink = DeepLinkRouter.shared
    /// Kept beyond init so the deep-link sheet can build its view model.
    private let timelineClient: TimelineClient

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
        self.timelineClient = timelineClient
        _auth = StateObject(wrappedValue: AuthViewModel(client: authClient))
        _account = StateObject(wrappedValue: AccountViewModel(client: authClient))
        _qrApprove = StateObject(wrappedValue: QrApproveViewModel(client: authClient))
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
                .environmentObject(qrApprove)
                .environmentObject(todos)
                .environmentObject(timeline)
                .environmentObject(serverStatus)
                .environmentObject(appearance)
                .preferredColorScheme(appearance.preference.colorScheme)
                // infralab://timeline/<id> — from the h5 share landing's
                // "在 app 中查看" or any other surface building timelineAppLink.
                .onOpenURL { deepLink.open($0) }
                .sheet(item: $deepLink.sharedPost) { route in
                    SharedPostView(postId: route.id, client: timelineClient)
                        .preferredColorScheme(appearance.preference.colorScheme)
                }
        }
    }
}
