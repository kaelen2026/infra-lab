package ai.deeplang.infra.data.remote

import ai.deeplang.infra.data.contracts.CreateTodoRequest
import ai.deeplang.infra.data.contracts.TodoResponse
import ai.deeplang.infra.data.contracts.TodosResponse
import ai.deeplang.infra.data.contracts.UpdateTodoRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Retrofit binding for the todo routes. Paths mirror `TODO_ROUTES`. Served by the same
 * authenticated OkHttp client as [AuthApi], so the Bearer header + 401-refresh apply here too.
 * Methods return `Response<T>` so the client can read the typed error body on non-2xx.
 */
interface TodoApi {
    @GET("/todos")
    suspend fun list(): Response<TodosResponse>

    @POST("/todos")
    suspend fun create(@Body body: CreateTodoRequest): Response<TodoResponse>

    @PATCH("/todos/{id}")
    suspend fun update(@Path("id") id: String, @Body body: UpdateTodoRequest): Response<TodoResponse>

    @DELETE("/todos/{id}")
    suspend fun remove(@Path("id") id: String): Response<Unit>
}
