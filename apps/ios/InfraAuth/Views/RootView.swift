import SwiftUI

/// Top-level view: restores the session on launch, then routes to the current
/// step. Mirrors the web auth page's phone → code → done progression.
struct RootView: View {
    @EnvironmentObject private var auth: AuthViewModel

    var body: some View {
        ZStack {
            AuthBackground()

            if auth.restoring {
                ProgressView()
                    .controlSize(.large)
                    .tint(.white)
            } else {
                content
                    .frame(maxWidth: 480)
            }
        }
        .task { await auth.bootstrap() }
        .animation(.snappy, value: auth.step)
        .animation(.snappy, value: auth.restoring)
    }

    @ViewBuilder
    private var content: some View {
        switch auth.step {
        case .phone: PhoneStepView()
        case .code: CodeStepView()
        case .done: DoneStepView()
        }
    }
}

#Preview("Phone") {
    RootView().environmentObject(AuthViewModel(client: PreviewAuthClient()))
}
