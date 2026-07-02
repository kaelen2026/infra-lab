import SwiftUI

/// The signed-in surface: a tab bar over the account dashboard and the todo
/// list — the two business screens web serves at `/` and `/todos`.
struct AuthenticatedView: View {
    var body: some View {
        TabView {
            AccountView()
                .tabItem { Label("账户", systemImage: "person.crop.circle") }
            TodosView()
                .tabItem { Label("待办", systemImage: "checklist") }
        }
        .tint(DesignTokens.primary)
    }
}

#if DEBUG
#Preview {
    AuthenticatedView()
        .environmentObject(AuthViewModel(client: PreviewAuthClient()))
        .environmentObject(AccountViewModel(client: PreviewAuthClient()))
        .environmentObject(TodoViewModel(client: PreviewTodoClient()))
}
#endif
