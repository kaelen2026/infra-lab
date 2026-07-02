import XCTest
@testable import InfraAuth

final class TodoClientTests: XCTestCase {
    private let baseURL = URL(string: "http://localhost:3001")!

    override func tearDown() {
        MockURLProtocol.handler = nil
        super.tearDown()
    }

    private func makeClient(store: TokenStore = InMemoryTokenStore()) -> HTTPTodoClient {
        HTTPTodoClient(baseURL: baseURL, store: store, session: MockURLProtocol.makeSession())
    }

    private func json(_ object: [String: Any]) -> Data {
        try! JSONSerialization.data(withJSONObject: object)
    }

    private func todoBody(id: String, title: String, completed: Bool) -> [String: Any] {
        [
            "id": id, "title": title, "completed": completed,
            "createdAt": "2026-07-01T09:30:00.000Z", "updatedAt": "2026-07-01T09:30:00.000Z",
            "completedAt": completed ? "2026-07-01T10:00:00.000Z" : NSNull(),
        ]
    }

    func testListParsesTodos() async throws {
        MockURLProtocol.handler = { _ in
            (200, self.json([
                "ok": true,
                "todos": [
                    self.todoBody(id: "t1", title: "买菜", completed: false),
                    self.todoBody(id: "t2", title: "写代码", completed: true),
                ],
            ]))
        }
        let todos = try await makeClient().list()
        XCTAssertEqual(todos.count, 2)
        XCTAssertEqual(todos.first?.title, "买菜")
        XCTAssertEqual(todos.last?.completed, true)
    }

    func testCreateSendsBearerAndReturnsTodo() async throws {
        let seed = AuthTokens(accessToken: "at", accessTokenExpiresIn: 900,
                              refreshToken: "rt", refreshTokenExpiresIn: 2_592_000, tokenType: "Bearer")
        var seenAuth: String?
        MockURLProtocol.handler = { request in
            seenAuth = request.value(forHTTPHeaderField: "Authorization")
            return (201, self.json(["ok": true, "todo": self.todoBody(id: "t9", title: "新待办", completed: false)]))
        }
        let created = try await makeClient(store: InMemoryTokenStore(seed)).create(title: "新待办")
        XCTAssertEqual(created.id, "t9")
        XCTAssertEqual(seenAuth, "Bearer at")
    }

    func testToggleParsesUpdatedTodo() async throws {
        MockURLProtocol.handler = { _ in
            (200, self.json(["ok": true, "todo": self.todoBody(id: "t1", title: "买菜", completed: true)]))
        }
        let updated = try await makeClient().toggle(id: "t1", completed: true)
        XCTAssertTrue(updated.completed)
        XCTAssertNotNil(updated.completedAt)
    }

    func testRemoveSucceedsOnOk() async throws {
        MockURLProtocol.handler = { _ in (200, self.json(["ok": true])) }
        try await makeClient().remove(id: "t1")
    }

    func testNotFoundMapsErrorCode() async {
        MockURLProtocol.handler = { _ in
            (404, self.json(["ok": false, "code": "TODO_NOT_FOUND"]))
        }
        do {
            _ = try await makeClient().toggle(id: "missing", completed: true)
            XCTFail("expected failure")
        } catch let error as TodoClientError {
            XCTAssertEqual(error.code, .todoNotFound)
        } catch {
            XCTFail("unexpected error: \(error)")
        }
    }
}
