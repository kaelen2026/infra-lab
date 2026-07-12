@testable import InfraLab
import XCTest

final class TimelineClientTests: XCTestCase {
    // Constant test fixture — force-unwrap is tolerated in tests only.
    // swiftlint:disable:next force_unwrapping
    private let baseURL = URL(string: "http://localhost:3001")!

    override func tearDown() {
        MockURLProtocol.handler = nil
        super.tearDown()
    }

    private func makeClient(store: TokenStore = InMemoryTokenStore()) -> HTTPTimelineClient {
        HTTPTimelineClient(baseURL: baseURL, store: store, session: MockURLProtocol.makeSession())
    }

    private func json(_ object: [String: Any]) -> Data {
        (try? JSONSerialization.data(withJSONObject: object)) ?? Data()
    }

    private func postBody(id: String, text: String, images: [String]) -> [String: Any] {
        [
            "id": id, "text": text,
            "images": images.map { ["url": $0] },
            "createdAt": "2026-07-01T09:30:00.000Z", "updatedAt": "2026-07-01T09:30:00.000Z"
        ]
    }

    func testListParsesPostsAndNextCursor() async throws {
        var seenURL: URL?
        MockURLProtocol.handler = { request in
            seenURL = request.url
            return (200, self.json([
                "ok": true,
                "posts": [
                    self.postBody(id: "p1", text: "第一条", images: ["/uploads/a.jpg"]),
                    self.postBody(id: "p2", text: "第二条", images: [])
                ],
                "nextCursor": "token-1"
            ]))
        }
        let page = try await makeClient().list()
        XCTAssertEqual(page.posts.count, 2)
        XCTAssertEqual(page.posts.first?.text, "第一条")
        XCTAssertEqual(page.posts.first?.images.first?.url, "/uploads/a.jpg")
        XCTAssertEqual(page.posts.last?.images.count, 0)
        XCTAssertEqual(page.nextCursor, "token-1")
        // First page carries no query string; the server applies its defaults.
        XCTAssertNil(seenURL?.query)
    }

    func testListSendsCursorAndLimitAsQuery() async throws {
        var seenURL: URL?
        MockURLProtocol.handler = { request in
            seenURL = request.url
            return (200, self.json(["ok": true, "posts": [], "nextCursor": NSNull()]))
        }
        let page = try await makeClient().list(cursor: "abc123", limit: 5)
        XCTAssertEqual(page.posts.count, 0)
        XCTAssertNil(page.nextCursor)
        let components = seenURL.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) }
        let query = Dictionary(
            uniqueKeysWithValues: (components?.queryItems ?? []).map { ($0.name, $0.value) }
        )
        XCTAssertEqual(components?.path, "/timeline")
        XCTAssertEqual(query["cursor"], "abc123")
        XCTAssertEqual(query["limit"], "5")
    }

    func testCreateSendsBearerAndReturnsPost() async throws {
        let seed = AuthTokens(accessToken: "at", accessTokenExpiresIn: 900,
                              refreshToken: "rt", refreshTokenExpiresIn: 2_592_000, tokenType: "Bearer")
        var seenAuth: String?
        MockURLProtocol.handler = { request in
            seenAuth = request.value(forHTTPHeaderField: "Authorization")
            return (201, self.json([
                "ok": true,
                "post": self.postBody(id: "p9", text: "新动态", images: [])
            ]))
        }
        let created = try await makeClient(store: InMemoryTokenStore(seed))
            .create(text: "新动态", images: [])
        XCTAssertEqual(created.id, "p9")
        XCTAssertEqual(seenAuth, "Bearer at")
    }

    func testUploadImageParsesUrl() async throws {
        var seenContentType: String?
        MockURLProtocol.handler = { request in
            seenContentType = request.value(forHTTPHeaderField: "Content-Type")
            return (201, self.json(["ok": true, "image": ["url": "/uploads/x.jpg"]]))
        }
        let image = try await makeClient().uploadImage(Data([1, 2, 3]), contentType: .jpeg)
        XCTAssertEqual(image.url, "/uploads/x.jpg")
        XCTAssertEqual(seenContentType?.hasPrefix("multipart/form-data; boundary="), true)
    }

    func testRemoveSucceedsOnOk() async throws {
        MockURLProtocol.handler = { _ in (200, self.json(["ok": true])) }
        try await makeClient().remove(id: "p1")
    }

    func testUnsupportedTypeMapsErrorCode() async {
        MockURLProtocol.handler = { _ in
            (415, self.json(["ok": false, "code": "UNSUPPORTED_IMAGE_TYPE"]))
        }
        do {
            _ = try await makeClient().uploadImage(Data([0]), contentType: .jpeg)
            XCTFail("expected failure")
        } catch let error as TimelineClientError {
            XCTAssertEqual(error.code, .unsupportedImageType)
        } catch {
            XCTFail("unexpected error: \(error)")
        }
    }

    func testNotFoundMapsErrorCode() async {
        MockURLProtocol.handler = { _ in
            (404, self.json(["ok": false, "code": "TIMELINE_POST_NOT_FOUND"]))
        }
        do {
            try await makeClient().remove(id: "missing")
            XCTFail("expected failure")
        } catch let error as TimelineClientError {
            XCTAssertEqual(error.code, .postNotFound)
        } catch {
            XCTFail("unexpected error: \(error)")
        }
    }

    func testGetSharedHitsPublicPathAndParsesPost() async throws {
        var seenURL: URL?
        MockURLProtocol.handler = { request in
            seenURL = request.url
            return (200, self.json([
                "ok": true,
                "post": self.postBody(id: "p5", text: "共享的动态", images: ["/uploads/s.jpg"])
            ]))
        }
        // No token seeded: the share endpoint is public, the request must still work.
        let post = try await makeClient().getShared(id: "p5")
        XCTAssertEqual(post.id, "p5")
        XCTAssertEqual(post.images.first?.url, "/uploads/s.jpg")
        XCTAssertEqual(seenURL?.path, "/timeline/share/p5")
    }

    func testGetSharedNotFoundMapsErrorCode() async {
        MockURLProtocol.handler = { _ in
            (404, self.json(["ok": false, "code": "TIMELINE_POST_NOT_FOUND"]))
        }
        do {
            _ = try await makeClient().getShared(id: "missing")
            XCTFail("expected failure")
        } catch let error as TimelineClientError {
            XCTAssertEqual(error.code, .postNotFound)
        } catch {
            XCTFail("unexpected error: \(error)")
        }
    }
}
