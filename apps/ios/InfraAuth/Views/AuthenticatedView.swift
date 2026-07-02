import SwiftUI

/// The signed-in surface: a tab bar over the account dashboard, the todo list and
/// the timeline feed. Account + todos mirror the two web business screens; the
/// timeline is an iOS-only feature.
struct AuthenticatedView: View {
    var body: some View {
        TabView {
            AccountView()
                .tabItem { Label("账户", systemImage: "person.crop.circle") }
            TodosView()
                .tabItem { Label("待办", systemImage: "checklist") }
            TimelineView()
                .tabItem { Label("动态", systemImage: "photo.on.rectangle.angled") }
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
        .environmentObject(TimelineViewModel(client: PreviewTimelineClient()))
        .environmentObject(AppearanceStore())
}
#endif
