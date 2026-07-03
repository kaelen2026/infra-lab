package dev.w3ctech.infralab.data.remote

import dev.w3ctech.infralab.data.contracts.CreateTimelinePostRequest
import dev.w3ctech.infralab.data.contracts.TimelineImageResponse
import dev.w3ctech.infralab.data.contracts.TimelinePostResponse
import dev.w3ctech.infralab.data.contracts.TimelinePostsResponse
import okhttp3.MultipartBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Retrofit binding for the timeline routes. Paths mirror `TIMELINE_ROUTES`. Served by the same
 * authenticated OkHttp client as [AuthApi], so the Bearer header + 401-refresh apply here too.
 * Methods return `Response<T>` so the client can read the typed error body on non-2xx.
 */
interface TimelineApi {
    @GET("/timeline")
    suspend fun list(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<TimelinePostsResponse>

    /**
     * Multipart upload; the server reads the `file` part and its `Content-Type`. The part's media
     * type (set on the [MultipartBody.Part]) becomes the uploaded file's type server-side.
     */
    @Multipart
    @POST("/timeline/images")
    suspend fun uploadImage(@Part file: MultipartBody.Part): Response<TimelineImageResponse>

    @POST("/timeline")
    suspend fun create(@Body body: CreateTimelinePostRequest): Response<TimelinePostResponse>

    @DELETE("/timeline/{id}")
    suspend fun remove(@Path("id") id: String): Response<Unit>
}
