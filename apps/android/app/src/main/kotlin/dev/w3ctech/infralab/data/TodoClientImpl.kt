package dev.w3ctech.infralab.data

import dev.w3ctech.infralab.data.contracts.CreateTodoRequest
import dev.w3ctech.infralab.data.contracts.TodoDTO
import dev.w3ctech.infralab.data.contracts.UpdateTodoRequest
import dev.w3ctech.infralab.data.remote.TodoApi
import retrofit2.Response

/**
 * Default [TodoClient]: drives the Retrofit [TodoApi] and turns non-2xx responses into typed
 * [TodoException]s. The Bearer header and 401-refresh are handled by the shared authenticated
 * OkHttp client the [TodoApi] is built on, so this layer never touches tokens.
 */
class TodoClientImpl(
    private val api: TodoApi,
) : TodoClient {

    override suspend fun list(): List<TodoDTO> = unwrap(api.list()).todos

    override suspend fun create(title: String): TodoDTO =
        unwrap(api.create(CreateTodoRequest(title = title))).todo

    override suspend fun toggle(id: String, completed: Boolean): TodoDTO =
        unwrap(api.update(id, UpdateTodoRequest(completed = completed))).todo

    override suspend fun remove(id: String) {
        val response = api.remove(id)
        if (!response.isSuccessful) {
            throw TodoErrorParser.parse(response.code(), response.errorBody()?.string())
        }
    }

    private fun <T> unwrap(response: Response<T>): T {
        if (response.isSuccessful) {
            return response.body()
                ?: throw TodoException(code = null, status = response.code(), message = "Empty response body")
        }
        throw TodoErrorParser.parse(response.code(), response.errorBody()?.string())
    }
}
