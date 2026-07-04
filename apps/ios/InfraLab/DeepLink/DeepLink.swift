import Foundation

/// A parsed `infralab://` deep link. The scheme is shared across surfaces via
/// `TIMELINE_APP_SCHEME` in `@infra/shared` (mirrored as
/// ``TimelineRoutes/appScheme``): the h5 share landing builds
/// `infralab://timeline/<id>` for its "在 app 中查看" button, and a push payload
/// may carry the same url under the custom `link` key.
enum DeepLink: Equatable {
    /// Open one shared timeline post via the public share endpoint.
    case timelinePost(id: String)

    /// Parse a custom-scheme url, e.g. `infralab://timeline/<id>`. Returns nil
    /// for any other scheme, host, or path shape — an unknown link is ignored,
    /// never mis-routed.
    init?(url: URL) {
        guard
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            components.scheme?.lowercased() == TimelineRoutes.appScheme,
            components.host == "timeline"
        else { return nil }
        let segments = components.path.split(separator: "/")
        guard segments.count == 1, let id = segments.first, !id.isEmpty else { return nil }
        self = .timelinePost(id: String(id))
    }

    /// Parse a remote-notification payload. The server puts the deep-link url in
    /// a custom `link` key alongside `aps` (see `ApnsPayload.data` in
    /// `apps/api/src/services/apns-client.ts`).
    init?(notificationUserInfo userInfo: [AnyHashable: Any]) {
        guard
            let raw = userInfo["link"] as? String,
            let url = URL(string: raw)
        else { return nil }
        self.init(url: url)
    }
}
