import SwiftUI

/// Top-level view: restores the session on launch, then routes to the current
/// step. Mirrors the web app's flow — phone → code to authenticate, then the
/// signed-in tabs (account + todos).
struct RootView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @EnvironmentObject private var serverStatus: ServerStatusMonitor
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if auth.restoring {
                ZStack {
                    AuthBackground()
                    ProgressView()
                        .controlSize(.large)
                        .tint(DesignTokens.primary)
                }
            } else if auth.step == .done {
                AuthenticatedView()
            } else {
                authFlow
            }
        }
        // Global service-status bar above every screen (auth flow + signed-in tabs).
        .safeAreaInset(edge: .top, spacing: 0) { ServerStatusBanner() }
        .task {
            // scenePhase's onChange doesn't fire for the initial `.active`, so kick
            // off polling here; the loop launches on its own Task and doesn't block.
            serverStatus.start()
            await auth.bootstrap()
        }
        // Poll while foregrounded; re-probe immediately on return, pause when hidden.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { serverStatus.start() } else { serverStatus.stop() }
        }
        .animation(.snappy, value: auth.step)
        .animation(.snappy, value: auth.restoring)
    }

    /// The unauthenticated card flow (phone / code), centered over the paper
    /// background with the transport footnote.
    private var authFlow: some View {
        ZStack {
            AuthBackground()
            VStack(spacing: 16) {
                switch auth.step {
                case .phone: PhoneStepView()
                case .code: CodeStepView()
                case .done: EmptyView()
                }
                Text(AuthCopy.footer)
                    .font(.caption2)
                    .foregroundStyle(DesignTokens.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 44)
            }
            .frame(maxWidth: 480)
        }
    }
}

#if DEBUG
#Preview("Phone") {
    RootView()
        .environmentObject(AuthViewModel(client: PreviewAuthClient()))
        .environmentObject(ServerStatusMonitor.preview(.online))
}

#Preview("Offline") {
    RootView()
        .environmentObject(AuthViewModel(client: PreviewAuthClient()))
        .environmentObject(ServerStatusMonitor.preview(.offline))
}
#endif
