import AuthenticationServices
import SwiftUI

/// Step 1 — collect the E.164 phone number and request a code.
struct PhoneStepView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.colorScheme) private var colorScheme
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

            orDivider

            // Native Sign in with Apple. The button renders a system-localized label;
            // the view model owns the nonce + token exchange (login == register).
            SignInWithAppleButton(.signIn) { request in
                auth.startAppleSignIn(request)
            } onCompletion: { result in
                Task { await auth.completeAppleSignIn(result) }
            }
            .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
            .frame(height: 52)
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.radius, style: .continuous))
            .disabled(auth.busy)
        }
        .onAppear { focused = true }
    }

    /// "———— 或 ————" — a labeled separator between phone login and social sign-in.
    private var orDivider: some View {
        HStack(spacing: 12) {
            line
            Text(AuthCopy.Social.orDivider)
                .font(.footnote)
                .foregroundStyle(DesignTokens.textSecondary)
            line
        }
    }

    private var line: some View {
        Rectangle()
            .fill(DesignTokens.textSecondary.opacity(0.25))
            .frame(height: 1)
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
