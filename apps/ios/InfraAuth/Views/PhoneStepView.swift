import SwiftUI

/// Step 1 — collect the E.164 phone number and request a code.
struct PhoneStepView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @FocusState private var focused: Bool

    var body: some View {
        AuthCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("登录 / 注册")
                    .font(.title.bold())
                Text("输入手机号,我们会发送一条验证码短信。")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("手机号")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(.secondary)
                TextField("+8613800138000", text: $auth.phone)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .font(.title3.monospacedDigit())
                    .focused($focused)
                    .padding(14)
                    .background(.background.opacity(0.6),
                                in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }

            ErrorBanner(message: auth.errorMessage)

            PrimaryButton(title: "获取验证码", loading: auth.busy, enabled: auth.canSend) {
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
