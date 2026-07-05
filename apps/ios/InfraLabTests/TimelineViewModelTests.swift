@testable import InfraLab
import UIKit
import XCTest

/// Scriptable ``TimelineClient``: canned pages keyed by cursor, recorded calls.
private final class FakeTimelineClient: TimelineClient {
    struct Unscripted: Error {}

    /// Page returned per cursor key ("" = first page).
    var pages: [String: Result<TimelinePage, Error>] = [:]
    var uploadResult: Result<TimelineImage, Error> = .failure(Unscripted())
    var createResult: Result<TimelinePostDTO, Error> = .failure(Unscripted())
    var removeError: Error?

    private(set) var listedCursors: [String] = []
    private(set) var uploadCount = 0
    private(set) var createdInputs: [(text: String, images: [TimelineImage])] = []
    private(set) var removedIds: [String] = []

    func list(cursor: String?, limit: Int?) async throws -> TimelinePage {
        let key = cursor ?? ""
        listedCursors.append(key)
        guard let page = pages[key] else { throw Unscripted() }
        return try page.get()
    }
    func uploadImage(_ data: Data, contentType: TimelineImageContentType) async throws -> TimelineImage {
        uploadCount += 1
        return try uploadResult.get()
    }
    func create(text: String, images: [TimelineImage]) async throws -> TimelinePostDTO {
        createdInputs.append((text, images))
        return try createResult.get()
    }
    func remove(id: String) async throws {
        removedIds.append(id)
        if let removeError { throw removeError }
    }
    func getShared(id: String) async throws -> TimelinePostDTO { throw Unscripted() }
}

private func post(_ id: String, text: String = "动态") -> TimelinePostDTO {
    TimelinePostDTO(
        id: id, text: text, images: [],
        createdAt: "2026-07-01T09:30:00.000Z", updatedAt: "2026-07-01T09:30:00.000Z"
    )
}

private func makeImage() -> UIImage {
    UIGraphicsImageRenderer(size: CGSize(width: 2, height: 2)).image { context in
        UIColor.red.setFill()
        context.fill(CGRect(x: 0, y: 0, width: 2, height: 2))
    }
}

@MainActor
final class TimelineViewModelTests: XCTestCase {
    func testLoadPublishesFirstPageAndCursor() async {
        let client = FakeTimelineClient()
        client.pages[""] = .success(TimelinePage(posts: [post("p1")], nextCursor: "c1"))
        let model = TimelineViewModel(client: client)

        await model.load()

        XCTAssertEqual(model.posts?.map(\.id), ["p1"])
        XCTAssertTrue(model.hasMore)
        XCTAssertNil(model.error)
    }

    func testLoadFailureSurfacesError() async {
        let client = FakeTimelineClient()
        client.pages[""] = .failure(URLError(.notConnectedToInternet))
        let model = TimelineViewModel(client: client)

        await model.load()

        XCTAssertNotNil(model.error)
        XCTAssertTrue(model.loading == false || model.posts == nil)
    }

    func testLoadMoreAppendsAndDedupsAgainstLocalPrepends() async {
        let client = FakeTimelineClient()
        client.pages[""] = .success(TimelinePage(posts: [post("p1"), post("p2")], nextCursor: "c1"))
        // The older page re-serves p2 (as after a local prepend shifted pages).
        client.pages["c1"] = .success(TimelinePage(posts: [post("p2"), post("p3")], nextCursor: nil))
        let model = TimelineViewModel(client: client)
        await model.load()

        await model.loadMore()

        XCTAssertEqual(model.posts?.map(\.id), ["p1", "p2", "p3"])
        XCTAssertFalse(model.hasMore)
        XCTAssertEqual(client.listedCursors, ["", "c1"])
    }

    func testLoadMoreIsNoOpWhenExhausted() async {
        let client = FakeTimelineClient()
        client.pages[""] = .success(TimelinePage(posts: [post("p1")], nextCursor: nil))
        let model = TimelineViewModel(client: client)
        await model.load()

        await model.loadMore()

        XCTAssertEqual(client.listedCursors, [""])
    }

    func testLoadMoreFailureKeepsCursorForRetry() async {
        let client = FakeTimelineClient()
        client.pages[""] = .success(TimelinePage(posts: [post("p1")], nextCursor: "c1"))
        client.pages["c1"] = .failure(URLError(.timedOut))
        let model = TimelineViewModel(client: client)
        await model.load()

        await model.loadMore()

        XCTAssertNotNil(model.error)
        XCTAssertTrue(model.hasMore)
    }

    func testPublishTextOnlySkipsUploadAndPrepends() async {
        let client = FakeTimelineClient()
        client.pages[""] = .success(TimelinePage(posts: [post("p1")], nextCursor: nil))
        client.createResult = .success(post("p2", text: "新动态"))
        let model = TimelineViewModel(client: client)
        await model.load()

        let ok = await model.publish(text: "  新动态  ", images: [])

        XCTAssertTrue(ok)
        XCTAssertEqual(client.uploadCount, 0)
        XCTAssertEqual(client.createdInputs.first?.text, "新动态")
        XCTAssertEqual(model.posts?.map(\.id), ["p2", "p1"])
        XCTAssertFalse(model.publishing)
    }

    func testPublishUploadsEveryImageThenCreatesWithRefs() async {
        let client = FakeTimelineClient()
        client.uploadResult = .success(TimelineImage(url: "/uploads/a.jpg"))
        client.createResult = .success(post("p9"))
        let model = TimelineViewModel(client: client)

        let ok = await model.publish(text: "", images: [makeImage(), makeImage()])

        XCTAssertTrue(ok)
        XCTAssertEqual(client.uploadCount, 2)
        XCTAssertEqual(client.createdInputs.first?.images.count, 2)
    }

    func testPublishWithNothingToSendIsRejectedLocally() async {
        let client = FakeTimelineClient()
        let model = TimelineViewModel(client: client)

        let ok = await model.publish(text: "   ", images: [])

        XCTAssertFalse(ok)
        XCTAssertEqual(client.uploadCount, 0)
        XCTAssertTrue(client.createdInputs.isEmpty)
    }

    func testPublishFailureReturnsFalseWithError() async {
        let client = FakeTimelineClient()
        client.createResult = .failure(URLError(.timedOut))
        let model = TimelineViewModel(client: client)

        let ok = await model.publish(text: "新动态", images: [])

        XCTAssertFalse(ok)
        XCTAssertNotNil(model.error)
        XCTAssertFalse(model.publishing)
    }

    func testRemoveDropsPostAndFailureKeepsIt() async {
        let client = FakeTimelineClient()
        client.pages[""] = .success(TimelinePage(posts: [post("p1"), post("p2")], nextCursor: nil))
        let model = TimelineViewModel(client: client)
        await model.load()

        await model.remove(id: "p1")
        XCTAssertEqual(model.posts?.map(\.id), ["p2"])

        client.removeError = URLError(.timedOut)
        await model.remove(id: "p2")
        XCTAssertEqual(model.posts?.map(\.id), ["p2"])
        XCTAssertNotNil(model.error)
        XCTAssertTrue(model.pendingIds.isEmpty)
    }
}
