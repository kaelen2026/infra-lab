import Foundation

/// Identifiable wrapper for `.sheet(item:)` presentation of a shared post.
struct SharedPostRoute: Identifiable, Equatable {
    /// The post id — also the sheet identity, so a new link swaps the content.
    let id: String
}

/// Routes parsed deep links to UI state. A singleton (like ``PushRegistration``)
/// because links arrive from two non-SwiftUI entry points — `onOpenURL` and the
/// notification-center delegate in ``AppDelegate`` — while the app observes it
/// as an `ObservableObject` to drive presentation.
@MainActor
final class DeepLinkRouter: ObservableObject {
    static let shared = DeepLinkRouter()

    /// When set, the app presents the shared-post sheet for this post.
    @Published var sharedPost: SharedPostRoute?

    /// Handle a custom-scheme url (`onOpenURL`). Unknown links are ignored.
    func open(_ url: URL) {
        guard let link = DeepLink(url: url) else { return }
        handle(link)
    }

    /// Handle a tapped push notification's payload. Payloads without a valid
    /// `link` key just open the app, which is the correct default.
    func openNotification(userInfo: [AnyHashable: Any]) {
        guard let link = DeepLink(notificationUserInfo: userInfo) else { return }
        handle(link)
    }

    private func handle(_ link: DeepLink) {
        switch link {
        case let .timelinePost(id):
            sharedPost = SharedPostRoute(id: id)
        }
    }
}
