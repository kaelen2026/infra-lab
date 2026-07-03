package dev.w3ctech.infralab.data

import dev.w3ctech.infralab.data.contracts.CreateTimelinePostRequest
import dev.w3ctech.infralab.data.contracts.TimelineImage
import dev.w3ctech.infralab.data.contracts.TimelineImageContentType
import dev.w3ctech.infralab.data.contracts.TimelinePage
import dev.w3ctech.infralab.data.contracts.TimelinePostDTO
import dev.w3ctech.infralab.data.remote.TimelineApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Response

/**
 * Default [TimelineClient]: drives the Retrofit [TimelineApi] and turns non-2xx responses into typed
 * [TimelineException]s. The Bearer header and 401-refresh are handled by the shared authenticated
 * OkHttp client the [TimelineApi] is built on, so this layer never touches tokens.
 */
class TimelineClientImpl(
    private val api: TimelineApi,
) : TimelineClient {

    override suspend fun list(cursor: String?, limit: Int?): TimelinePage {
        val body = unwrap(api.list(cursor = cursor, limit = limit))
        return TimelinePage(posts = body.posts, nextCursor = body.nextCursor)
    }

    override suspend fun uploadImage(
        bytes: ByteArray,
        contentType: TimelineImageContentType,
    ): TimelineImage {
        val mediaType = contentType.mime.toMediaType()
        val part = MultipartBody.Part.createFormData(
            name = "file",
            filename = "upload.${contentType.fileExtension}",
            body = bytes.toRequestBody(mediaType),
        )
        return TimelineImage(url = unwrap(api.uploadImage(part)).image.url)
    }

    override suspend fun create(text: String, images: List<TimelineImage>): TimelinePostDTO =
        unwrap(api.create(CreateTimelinePostRequest(text = text, images = images))).post

    override suspend fun remove(id: String) {
        val response = api.remove(id)
        if (!response.isSuccessful) {
            throw TimelineErrorParser.parse(response.code(), response.errorBody()?.string())
        }
    }

    private fun <T> unwrap(response: Response<T>): T {
        if (response.isSuccessful) {
            return response.body()
                ?: throw TimelineException(code = null, status = response.code(), message = "Empty response body")
        }
        throw TimelineErrorParser.parse(response.code(), response.errorBody()?.string())
    }
}
