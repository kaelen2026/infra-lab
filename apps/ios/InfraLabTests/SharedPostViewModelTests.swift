@testable import InfraLab
import XCTest

/// Scriptable ``TimelineClient`` — only `getShared` matters for these tests.
private final class FakeTimelineClient: TimelineClient {
    var sharedResult: Result<TimelinePostDTO, Error> = .failure(Unscripted())
    private(set) var requestedIds: [String] = []

    struct Unscripted: Error {}

    func getShared(id: String) async throws -> TimelinePostDTO {
        requestedIds.append(id)
        return try sharedResult.get()
    }

    func list(cursor: String?, limit: Int?) async throws -> TimelinePage {
        TimelinePage(posts: [], nextCursor: nil)
    }
    func uploadImage(_ data: Data, contentType: TimelineImageContentType) async throws -> TimelineImage {
        throw Unscripted()
    }
    func create(text: String, images: [TimelineImage]) async throws -> TimelinePostDTO {
        throw Unscripted()
    }
    func remove(id: String) async throws { throw Unscripted() }
}

private func post(id: String) -> TimelinePostDTO {
    TimelinePostDTO(
        id: id, text: "hello", images: [],
        createdAt: "2026-07-01T09:30:00.000Z", updatedAt: "2026-07-01T09:30:00.000Z"
    )
}

@MainActor
final class SharedPostViewModelTests: XCTestCase {
    func testLoadPublishesPostOnSuccess() async {
        let client = FakeTimelineClient()
        client.sharedResult = .success(post(id: "p1"))
        let model = SharedPostViewModel(postId: "p1", client: client)

        await model.load()

        XCTAssertEqual(model.state, .ready(post(id: "p1")))
        XCTAssertEqual(client.requestedIds, ["p1"])
    }

    func testNotFoundGetsSpecificMessage() async {
        let client = FakeTimelineClient()
        client.sharedResult = .failure(
            TimelineClientError.http(status: 404, code: .postNotFound)
        )
        let model = SharedPostViewModel(postId: "gone", client: client)

        await model.load()

        guard case let .failed(message) = model.state else {
            return XCTFail("expected .failed, got \(model.state)")
        }
        XCTAssertTrue(message.contains("不存在"))
    }

    func testTransportFailureGetsGenericMessage() async {
        let client = FakeTimelineClient()
        client.sharedResult = .failure(
            TimelineClientError.transport(URLError(.notConnectedToInternet))
        )
        let model = SharedPostViewModel(postId: "p1", client: client)

        await model.load()

        guard case let .failed(message) = model.state else {
            return XCTFail("expected .failed, got \(model.state)")
        }
        XCTAssertTrue(message.contains("重试"))
    }
}
