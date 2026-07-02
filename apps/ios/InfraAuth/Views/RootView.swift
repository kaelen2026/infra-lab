import SwiftUI

/// Top-level view: restores the session on launch, then routes to the current
/// step. Mirrors the web app's flow — phone → code to authenticate, then the
/// signed-in tabs (account + todos).
struct RootView: View {
    @EnvironmentObject private var auth: AuthViewModel

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
        .task { await auth.bootstrap() }
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
    RootView().environmentObject(AuthViewModel(client: PreviewAuthClient()))
}
#endif
