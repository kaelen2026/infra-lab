import Foundation

// Swift mirror of `@infra/shared`'s todo contracts — the single source of truth
// for the request/response shapes shared by every client. Every todo is scoped
// to the authenticated user.
//
// Keep this in lockstep with `packages/shared/src/contracts/todo.ts`. The server
// emits camelCase JSON, so the default `Codable` synthesis maps 1:1.

// MARK: - Validation

enum TodoValidation {
    static let maxTitleLength = 200

    /// Trim and clamp a raw title the way `titleSchema` does before sending.
    static func normalize(_ raw: String) -> String {
        String(raw.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxTitleLength))
    }
}

// MARK: - Requests / responses

struct CreateTodoInput: Encodable {
    let title: String
}

/// Partial update — at least one field must be present.
struct UpdateTodoInput: Encodable {
    var title: String?
    var completed: Bool?
}

struct TodoDTO: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let completed: Bool
    let createdAt: String // ISO 8601
    let updatedAt: String // ISO 8601
    let completedAt: String? // ISO 8601, nil while not completed
}

struct TodosResponse: Decodable {
    let ok: Bool
    let todos: [TodoDTO]
}

struct TodoResponse: Decodable {
    let ok: Bool
    let todo: TodoDTO
}

// MARK: - Error codes (stable, client-switchable)

enum TodoErrorCode: String, Decodable, Sendable {
    case invalidRequest = "INVALID_REQUEST"
    case unauthorized = "UNAUTHORIZED"
    case todoNotFound = "TODO_NOT_FOUND"
    /// Fallback for any code the server adds before this client is updated.
    case unknown = "UNKNOWN"

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = TodoErrorCode(rawValue: raw) ?? .unknown
    }
}

// MARK: - Endpoint paths (shared so the client never hard-codes strings)

enum TodoRoutes {
    static let list = "/todos"
    static let create = "/todos"

    /// Path for a single todo (update / delete).
    static func item(_ id: String) -> String { "/todos/\(id)" }
}
