@testable import InfraLab
import XCTest

/// Scriptable ``TodoClient``: canned results per method, recorded inputs.
private final class FakeTodoClient: TodoClient {
    struct Unscripted: Error {}

    var listResult: Result<[TodoDTO], Error> = .success([])
    var createResult: Result<TodoDTO, Error> = .failure(Unscripted())
    var toggleResult: Result<TodoDTO, Error> = .failure(Unscripted())
    var removeError: Error?

    private(set) var createdTitles: [String] = []
    private(set) var toggledIds: [String] = []
    private(set) var removedIds: [String] = []

    func list() async throws -> [TodoDTO] { try listResult.get() }
    func create(title: String) async throws -> TodoDTO {
        createdTitles.append(title)
        return try createResult.get()
    }
    func update(id: String, patch: UpdateTodoInput) async throws -> TodoDTO {
        try toggleResult.get()
    }
    func toggle(id: String, completed: Bool) async throws -> TodoDTO {
        toggledIds.append(id)
        return try toggleResult.get()
    }
    func remove(id: String) async throws {
        removedIds.append(id)
        if let removeError { throw removeError }
    }
}

private func todo(_ id: String, title: String = "待办", completed: Bool = false) -> TodoDTO {
    TodoDTO(
        id: id, title: title, completed: completed,
        createdAt: "2026-07-01T09:30:00.000Z", updatedAt: "2026-07-01T09:30:00.000Z",
        completedAt: completed ? "2026-07-01T10:00:00.000Z" : nil
    )
}

@MainActor
final class TodoViewModelTests: XCTestCase {
    func testLoadPublishesListAndClearsLoading() async {
        let client = FakeTodoClient()
        client.listResult = .success([todo("t1"), todo("t2")])
        let model = TodoViewModel(client: client)
        XCTAssertTrue(model.loading)

        await model.load()

        XCTAssertEqual(model.todos?.map(\.id), ["t1", "t2"])
        XCTAssertFalse(model.loading)
        XCTAssertNil(model.error)
    }

    func testLoadFailureSurfacesErrorAndEndsLoading() async {
        let client = FakeTodoClient()
        client.listResult = .failure(URLError(.notConnectedToInternet))
        let model = TodoViewModel(client: client)

        await model.load()

        XCTAssertNotNil(model.error)
        XCTAssertFalse(model.loading)
        XCTAssertNil(model.todos)
    }

    func testCreatePrependsNormalizedTitle() async {
        let client = FakeTodoClient()
        client.listResult = .success([todo("t1")])
        client.createResult = .success(todo("t2", title: "新待办"))
        let model = TodoViewModel(client: client)
        await model.load()

        await model.create(title: "  新待办  ")

        XCTAssertEqual(client.createdTitles, ["新待办"])
        XCTAssertEqual(model.todos?.map(\.id), ["t2", "t1"])
        XCTAssertFalse(model.creating)
    }

    func testCreateWithBlankTitleNeverCallsClient() async {
        let client = FakeTodoClient()
        let model = TodoViewModel(client: client)

        await model.create(title: "   ")

        XCTAssertTrue(client.createdTitles.isEmpty)
    }

    func testCreateFailureSetsErrorAndResetsBusy() async {
        let client = FakeTodoClient()
        client.createResult = .failure(URLError(.timedOut))
        let model = TodoViewModel(client: client)

        await model.create(title: "新待办")

        XCTAssertNotNil(model.error)
        XCTAssertFalse(model.creating)
    }

    func testToggleReplacesTheUpdatedRow() async {
        let client = FakeTodoClient()
        client.listResult = .success([todo("t1"), todo("t2")])
        client.toggleResult = .success(todo("t1", completed: true))
        let model = TodoViewModel(client: client)
        await model.load()

        await model.toggle(todo("t1"))

        XCTAssertEqual(client.toggledIds, ["t1"])
        XCTAssertEqual(model.todos?.first?.completed, true)
        XCTAssertEqual(model.todos?.last?.completed, false)
        XCTAssertTrue(model.pendingIds.isEmpty)
    }

    func testToggleFailureKeepsRowAndSetsError() async {
        let client = FakeTodoClient()
        client.listResult = .success([todo("t1")])
        client.toggleResult = .failure(URLError(.timedOut))
        let model = TodoViewModel(client: client)
        await model.load()

        await model.toggle(todo("t1"))

        XCTAssertEqual(model.todos?.first?.completed, false)
        XCTAssertNotNil(model.error)
        XCTAssertTrue(model.pendingIds.isEmpty)
    }

    func testRemoveDropsTheRow() async {
        let client = FakeTodoClient()
        client.listResult = .success([todo("t1"), todo("t2")])
        let model = TodoViewModel(client: client)
        await model.load()

        await model.remove(id: "t1")

        XCTAssertEqual(client.removedIds, ["t1"])
        XCTAssertEqual(model.todos?.map(\.id), ["t2"])
    }

    func testRemoveFailureKeepsRowAndSetsError() async {
        let client = FakeTodoClient()
        client.listResult = .success([todo("t1")])
        client.removeError = URLError(.timedOut)
        let model = TodoViewModel(client: client)
        await model.load()

        await model.remove(id: "t1")

        XCTAssertEqual(model.todos?.map(\.id), ["t1"])
        XCTAssertNotNil(model.error)
        XCTAssertTrue(model.pendingIds.isEmpty)
    }
}
