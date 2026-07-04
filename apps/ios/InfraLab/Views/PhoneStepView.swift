import SwiftUI

/// Step 1 — collect the E.164 phone number and request a code.
struct PhoneStepView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @FocusState private var focused: Bool

    var body: some View {
        AuthCard {
            BrandMark()

            VStack(alignment: .leading, spacing: 8) {
                Text(AuthCopy.Phone.title)
                    .font(AuthTheme.title)
                    .foregroundStyle(DesignTokens.textPrimary)
                Text(AuthCopy.Phone.description)
                    .font(.subheadline)
                    .foregroundStyle(DesignTokens.textSecondary)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(AuthCopy.Phone.label)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(DesignTokens.textSecondary)
                TextField(AuthCopy.Phone.placeholder, text: $auth.phone)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .font(.title3.monospacedDigit())
                    .foregroundStyle(DesignTokens.textPrimary)
                    .focused($focused)
                    .padding(14)
                    .authFieldBackground()
            }

            ErrorBanner(message: auth.errorMessage)

            PrimaryButton(title: AuthCopy.Phone.submit, loading: auth.busy, enabled: auth.canSend) {
                Task { await auth.sendCode() }
            }
        }
        .onAppear { focused = true }
    }
}

#if DEBUG
#Preview {
    ZStack {
        AuthBackground()
        PhoneStepView().environmentObject(AuthViewModel(client: PreviewAuthClient()))
    }
}
#endif
