import SwiftUI

/// Step 3 — authenticated. Shows who is signed in and offers logout.
struct DoneStepView: View {
    @EnvironmentObject private var auth: AuthViewModel

    var body: some View {
        AuthCard {
            VStack(alignment: .center, spacing: 16) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(DesignTokens.primary)

                Text(AuthCopy.Done.title)
                    .font(AuthTheme.title)
                    .foregroundStyle(DesignTokens.textPrimary)

                if let name = auth.displayName {
                    Text(name)
                        .font(.headline)
                        .foregroundStyle(DesignTokens.textSecondary)
                }

                if auth.user?.isNew == true {
                    Text(AuthCopy.Done.newAccount)
                        .font(.footnote)
                        .foregroundStyle(DesignTokens.textSecondary)
                        .multilineTextAlignment(.center)
                }
            }
            .frame(maxWidth: .infinity)

            PrimaryButton(title: AuthCopy.Done.logout) {
                Task { await auth.logout() }
            }
        }
    }
}

#if DEBUG
#Preview {
    let client = PreviewAuthClient()
    return ZStack {
        AuthBackground()
        DoneStepView().environmentObject({
            let vm = AuthViewModel(client: client)
            return vm
        }())
    }
}
#endif
