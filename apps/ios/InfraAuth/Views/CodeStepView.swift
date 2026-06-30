import SwiftUI

/// Step 2 — enter the 6-digit code, with resend cooldown and a way back.
struct CodeStepView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @FocusState private var focused: Bool

    var body: some View {
        AuthCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("输入验证码")
                    .font(.title.bold())
                Text("验证码已发送至 \(auth.phone)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            TextField("------", text: $auth.code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .font(.system(size: 34, weight: .semibold, design: .monospaced))
                .kerning(8)
                .multilineTextAlignment(.center)
                .focused($focused)
                .padding(.vertical, 14)
                .frame(maxWidth: .infinity)
                .background(.background.opacity(0.6),
                            in: RoundedRectangle(cornerRadius: 12, style: .continuous))

            if let debugCode = auth.debugCode {
                Label("调试验证码:\(debugCode)", systemImage: "ladybug.fill")
                    .font(.footnote)
                    .foregroundStyle(.orange)
            }

            ErrorBanner(message: auth.errorMessage)

            PrimaryButton(title: "登录", loading: auth.busy, enabled: auth.canVerify) {
                Task { await auth.verify() }
            }

            HStack {
                Button("返回修改手机号") { auth.changePhone() }
                Spacer()
                Button(resendTitle) { Task { await auth.sendCode() } }
                    .disabled(!auth.canResend || auth.busy)
            }
            .font(.footnote)
            .tint(AuthTheme.accent)
        }
        .onAppear { focused = true }
    }

    private var resendTitle: String {
        auth.canResend ? "重新发送" : "重新发送 (\(auth.cooldown)s)"
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
