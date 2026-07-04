import Foundation

/// The shape every platform SDK implements for the todo feature. Transport
/// mirrors ``AuthClient``: native sends `Authorization: Bearer <accessToken>`
/// (read from the shared ``TokenStore``). Mirrors the `TodoClient` interface in
/// `@infra/shared`.
protocol TodoClient {
    func list() async throws -> [TodoDTO]
    func create(title: String) async throws -> TodoDTO
    func update(id: String, patch: UpdateTodoInput) async throws -> TodoDTO
    /// Convenience over ``update(id:patch:)`` for the common completed toggle.
    func toggle(id: String, completed: Bool) async throws -> TodoDTO
    func remove(id: String) async throws
}

/// Transport-level failure of a todo request. Non-2xx responses surface a stable
/// ``TodoErrorCode``; the view model collapses everything to a generic message,
/// mirroring web's `useTodos` (which never branches on the code).
enum TodoClientError: Error {
    case http(status: Int, code: TodoErrorCode)
    case transport(Error)
    case decoding(Error)

    var code: TodoErrorCode? {
        if case let .http(_, code) = self { return code }
        return nil
    }
}

/// URLSession-backed todo client. Rides the shared ``AuthorizedTransport`` so the
/// Bearer header — and the refresh-and-retry on a `401` — stays in lockstep with
/// the session established at login.
final class HTTPTodoClient: TodoClient {
    private let baseURL: URL
    private let transport: AuthorizedTransport
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(baseURL: URL, transport: AuthorizedTransport) {
        self.baseURL = baseURL
        self.transport = transport
    }

    /// Convenience wiring for tests / standalone use: build a private transport +
    /// refresher over `session` and the auth ``TokenStore``. Production shares one
    /// transport across every client (see `InfraLabApp`).
    convenience init(baseURL: URL, store: TokenStore, session: URLSession = .shared) {
        let refresher = SessionRefresher(store: store) {
            try await AuthSession.rotateTokens(baseURL: baseURL, store: store, session: session)
        }
        let transport = AuthorizedTransport(store: store, session: session, refresher: refresher)
        self.init(baseURL: baseURL, transport: transport)
    }

    // MARK: TodoClient

    func list() async throws -> [TodoDTO] {
        let res: TodosResponse = try await send(TodoRoutes.list, method: "GET", body: Optional<CreateTodoInput>.none)
        return res.todos
    }

    func create(title: String) async throws -> TodoDTO {
        let res: TodoResponse = try await send(TodoRoutes.create, method: "POST", body: CreateTodoInput(title: title))
        return res.todo
    }

    func update(id: String, patch: UpdateTodoInput) async throws -> TodoDTO {
        let res: TodoResponse = try await send(TodoRoutes.item(id), method: "PATCH", body: patch)
        return res.todo
    }

    func toggle(id: String, completed: Bool) async throws -> TodoDTO {
        try await update(id: id, patch: UpdateTodoInput(title: nil, completed: completed))
    }

    func remove(id: String) async throws {
        struct OkResponse: Decodable { let ok: Bool }
        let _: OkResponse = try await send(TodoRoutes.item(id), method: "DELETE", body: Optional<CreateTodoInput>.none)
    }

    // MARK: - Transport

    private func send<Body: Encodable, Response: Decodable>(
        _ path: String, method: String, body: Body?
    ) async throws -> Response {
        let payload = try body.map { try encoder.encode($0) }

        let data: Data
        let http: HTTPURLResponse
        do {
            (data, http) = try await transport.send {
                var request = URLRequest(url: self.baseURL.appendingPathComponent(path))
                request.httpMethod = method
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = payload
                return request
            }
        } catch {
            throw TodoClientError.transport(error)
        }

        guard (200..<300).contains(http.statusCode) else {
            let parsed = try? decoder.decode(TodoErrorBody.self, from: data)
            throw TodoClientError.http(status: http.statusCode, code: parsed?.code ?? .unknown)
        }

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw TodoClientError.decoding(error)
        }
    }
}

/// Error payload shape shared by the todo endpoints (mirrors AuthErrorBody).
struct TodoErrorBody: Decodable {
    let code: TodoErrorCode?
}
