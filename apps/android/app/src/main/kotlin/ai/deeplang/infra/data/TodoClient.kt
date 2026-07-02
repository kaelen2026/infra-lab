package ai.deeplang.infra.data

import ai.deeplang.infra.data.contracts.TodoDTO

/**
 * The shape every platform SDK implements for the todo feature (mirrors the shared `TodoClient`
 * interface). Transport mirrors [AuthClient]: native sends `Authorization: Bearer <accessToken>`.
 * Calls throw [TodoException] on a non-2xx response.
 */
interface TodoClient {
    suspend fun list(): List<TodoDTO>

    suspend fun create(title: String): TodoDTO

    /** Convenience over the general update for the common completed toggle. */
    suspend fun toggle(id: String, completed: Boolean): TodoDTO

    suspend fun remove(id: String)
}
