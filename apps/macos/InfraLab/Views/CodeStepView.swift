import SwiftUI

/// Step 2 — enter the 6-digit code, with resend cooldown and a way back.
struct CodeStepView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @FocusState private var focused: Bool

    var body: some View {
        AuthCard {
            BrandMark()

            VStack(alignment: .leading, spacing: 8) {
                Text(AuthCopy.Code.title)
                    .font(AuthTheme.title)
                    .foregroundStyle(DesignTokens.textPrimary)
                Text(AuthCopy.Code.description(phone: auth.phone, minutes: OTPLimits.ttlSeconds / 60))
                    .font(.subheadline)
                    .foregroundStyle(DesignTokens.textSecondary)
            }

            TextField(AuthCopy.Code.placeholder, text: $auth.code)
                // Numeric keypad is iOS-only; the OTP autofill hint works on both.
                #if os(iOS)
                .keyboardType(.numberPad)
                #endif
                .textContentType(.oneTimeCode)
                .font(.system(size: 34, weight: .semibold, design: .monospaced))
                .foregroundStyle(DesignTokens.textPrimary)
                .kerning(8)
                .multilineTextAlignment(.center)
                .focused($focused)
                .padding(.vertical, 14)
                .frame(maxWidth: .infinity)
                .authFieldBackground()

            if let debugCode = auth.debugCode {
                Label("调试验证码:\(debugCode)", systemImage: "ladybug.fill")
                    .font(.footnote)
                    .foregroundStyle(DesignTokens.primary)
            }

            ErrorBanner(message: auth.errorMessage)

            PrimaryButton(title: AuthCopy.Code.submit, loading: auth.busy, enabled: auth.canVerify) {
                Task { await auth.verify() }
            }

            HStack {
                Button(AuthCopy.Code.changePhone) { auth.changePhone() }
                Spacer()
                Button(resendTitle) { Task { await auth.sendCode() } }
                    .disabled(!auth.canResend || auth.busy)
            }
            .font(.footnote)
            .tint(DesignTokens.primary)
        }
        .onAppear { focused = true }
    }

    private var resendTitle: String {
        auth.canResend ? AuthCopy.Code.resend : AuthCopy.Code.resendCooldown(seconds: auth.cooldown)
    }
}

#if DEBUG
#Preview {
    ZStack {
        AuthBackground()
        CodeStepView().environmentObject(AuthViewModel(client: PreviewAuthClient()))
    }
}
#endif
