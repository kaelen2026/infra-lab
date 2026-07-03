import SwiftUI

/// Top-level view: restores the session on launch, then routes to the current
/// step. Mirrors the web app's flow — phone → code to authenticate, then the
/// signed-in tabs (account + todos).
struct RootView: View {
    @EnvironmentObject private var auth: AuthViewModel
    /// Once true the brand splash (segment B) fades away, revealing the flow.
    @State private var splashDone = false

    var body: some View {
        ZStack {
            content

            if !splashDone {
                BrandSplashView()
                    .transition(.opacity)
                    .zIndex(1)
            }
        }
        .task { await launch() }
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
    RootView().environmentObject(AuthViewModel(client: PreviewAuthClient()))
}
#endif
