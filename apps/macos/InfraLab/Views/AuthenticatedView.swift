import SwiftUI

/// The signed-in surface: a tab bar over the business screens (todos + timeline).
/// The account is no longer a tab — it lives behind the App Store-style avatar
/// entry (``AccountAvatarButton``) pinned to the top-right of every tab, opened
/// as a modal (``AccountSheet``). Todos mirrors web; the timeline is iOS-only.
struct AuthenticatedView: View {
    var body: some View {
        TabView {
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
