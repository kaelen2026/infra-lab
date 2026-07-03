import SwiftUI

/// Top-level view: restores the session on launch, then routes to the current
/// step. Mirrors the web app's flow — phone → code to authenticate, then the
/// signed-in tabs (account + todos).
struct RootView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @EnvironmentObject private var serverStatus: ServerStatusMonitor
    @Environment(\.scenePhase) private var scenePhase
    /// Once true the brand splash (segment B) fades away, revealing the flow.
    @State private var splashDone = false

    var body: some View {
        ZStack {
            content
                // Global service-status bar above every screen (auth flow + tabs).
                // Attached to content so the cold-start splash covers it until done.
                .safeAreaInset(edge: .top, spacing: 0) { ServerStatusBanner() }

            if !splashDone {
                BrandSplashView()
                    .transition(.opacity)
                    .zIndex(1)
            }
        }
        .task {
            // scenePhase's onChange doesn't fire for the initial `.active`, so kick
            // off polling here; the loop launches on its own Task and doesn't block.
            serverStatus.start()
            await launch()
        }
        // Poll while foregrounded; re-probe immediately on return, pause when hidden.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { serverStatus.start() } else { serverStatus.stop() }
        }
        .animation(.snappy, value: auth.step)
    }

    /// Routed content behind the splash: the signed-in tabs or the auth flow.
    @ViewBuilder private var content: some View {
        if auth.step == .done {
            AuthenticatedView()
        } else {
            authFlow
        }
    }

    /// Restore the session while holding the splash for a minimum dwell, so it
    /// never flashes by on a fast or offline cold start. Both run concurrently;
    /// the splash cross-fades out once the later of the two finishes.
    private func launch() async {
        async let restore: Void = auth.bootstrap()
        async let dwell: Void = minimumDwell()
        await restore
        await dwell
        withAnimation(.easeOut(duration: 0.35)) { splashDone = true }
    }

    private func minimumDwell() async {
        try? await Task.sleep(nanoseconds: 800_000_000)
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
