package ai.deeplang.infra.data.contracts

import kotlinx.serialization.Serializable

/**
 * Kotlin mirror of `packages/shared/src/contracts/todo.ts` — the single source of truth for the
 * todo feature, shared by the API and every client SDK. Every todo is scoped to the authenticated
 * user; the transport rides the same Bearer token as the auth calls. Keep the field names in
 * lock-step with the TypeScript contracts (the server emits camelCase JSON).
 */

// ── Title ──────────────────────────────────────────────────────────────────────
object TodoLimits {
    const val MAX_TITLE_LENGTH = 200
}

/** Pure input normalization (trim + clamp), matching `titleSchema` before sending. */
object TodoInput {
    fun normalizeTitle(raw: String): String =
        raw.trim().take(TodoLimits.MAX_TITLE_LENGTH)
}

// ── Stable error codes (kept identical to TODO_ERROR_CODES) ─────────────────────
@Serializable
enum class TodoErrorCode {
    INVALID_REQUEST,
    UNAUTHORIZED,
    TODO_NOT_FOUND,
}

// ── Endpoint paths (kept identical to TODO_ROUTES) ──────────────────────────────
object TodoRoutes {
    const val LIST = "/todos"
    const val CREATE = "/todos"

    /** Path for a single todo (update / delete). */
    fun item(id: String): String = "/todos/$id"
}

// ── Requests ─────────────────────────────────────────────────────────────────────
@Serializable
data class CreateTodoRequest(
    val title: String,
)

/** Partial update — at least one field must be present. */
@Serializable
data class UpdateTodoRequest(
    val title: String? = null,
    val completed: Boolean? = null,
)

// ── DTO / responses ──────────────────────────────────────────────────────────────
@Serializable
data class TodoDTO(
    val id: String,
    val title: String,
    val completed: Boolean = false,
    val createdAt: String,
    val updatedAt: String,
    /** ISO 8601, null while not completed. */
    val completedAt: String? = null,
)

@Serializable
data class TodosResponse(
    val ok: Boolean = true,
    val todos: List<TodoDTO>,
)

@Serializable
data class TodoResponse(
    val ok: Boolean = true,
    val todo: TodoDTO,
)
