import SwiftUI

/// Step 3 — authenticated. Shows who is signed in and offers logout.
struct DoneStepView: View {
    @EnvironmentObject private var auth: AuthViewModel

    var body: some View {
        AuthCard {
            VStack(alignment: .center, spacing: 16) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(AuthTheme.accent)

                Text("已登录")
                    .font(.title.bold())

                if let name = auth.displayName {
                    Text(name)
                        .font(.headline)
                        .foregroundStyle(.secondary)
                }

                if auth.user?.isNew == true {
                    Text("欢迎加入,新账号已自动创建。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
            .frame(maxWidth: .infinity)

            PrimaryButton(title: "退出登录") {
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
