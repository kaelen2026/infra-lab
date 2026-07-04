@testable import InfraLab
import XCTest

final class DeepLinkTests: XCTestCase {
    /// Parse a raw string as a deep link (nil for unparseable urls too, which is
    /// what production sees — both reject paths collapse to "ignored").
    private func link(_ raw: String) -> DeepLink? {
        guard let url = URL(string: raw) else { return nil }
        return DeepLink(url: url)
    }

    // MARK: - URL parsing

    func testParsesTimelinePostLink() {
        XCTAssertEqual(link("infralab://timeline/6f9b2c1a"), .timelinePost(id: "6f9b2c1a"))
    }

    func testSchemeIsCaseInsensitive() {
        XCTAssertEqual(link("InfraLab://timeline/abc"), .timelinePost(id: "abc"))
    }

    func testRejectsOtherSchemes() {
        XCTAssertNil(link("https://timeline/abc"))
        XCTAssertNil(link("otherapp://timeline/abc"))
    }

    func testRejectsUnknownHost() {
        XCTAssertNil(link("infralab://todos/abc"))
    }

    func testRejectsMissingOrExtraPathSegments() {
        XCTAssertNil(link("infralab://timeline"))
        XCTAssertNil(link("infralab://timeline/"))
        XCTAssertNil(link("infralab://timeline/abc/extra"))
    }

    // MARK: - Push payload parsing

    func testParsesLinkKeyFromNotificationUserInfo() {
        let userInfo: [AnyHashable: Any] = [
            "aps": ["alert": ["title": "t", "body": "b"]],
            "link": "infralab://timeline/p42"
        ]
        XCTAssertEqual(DeepLink(notificationUserInfo: userInfo), .timelinePost(id: "p42"))
    }

    func testIgnoresPayloadWithoutUsableLink() {
        XCTAssertNil(DeepLink(notificationUserInfo: ["aps": ["alert": "hi"]]))
        XCTAssertNil(DeepLink(notificationUserInfo: ["link": 42]))
        XCTAssertNil(DeepLink(notificationUserInfo: ["link": "https://example.com/x"]))
    }

    // MARK: - Router

    @MainActor
    func testRouterPresentsSharedPostForValidLink() throws {
        let router = DeepLinkRouter()
        router.open(try XCTUnwrap(URL(string: "infralab://timeline/p7")))
        XCTAssertEqual(router.sharedPost, SharedPostRoute(id: "p7"))
    }

    @MainActor
    func testRouterIgnoresUnknownLinkKeepingCurrentRoute() throws {
        let router = DeepLinkRouter()
        router.open(try XCTUnwrap(URL(string: "infralab://timeline/p7")))
        router.open(try XCTUnwrap(URL(string: "infralab://nope/p8")))
        XCTAssertEqual(router.sharedPost, SharedPostRoute(id: "p7"))
    }

    @MainActor
    func testRouterRoutesNotificationPayload() {
        let router = DeepLinkRouter()
        router.openNotification(userInfo: ["link": "infralab://timeline/p9"])
        XCTAssertEqual(router.sharedPost, SharedPostRoute(id: "p9"))
    }
}
