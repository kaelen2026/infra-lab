package ai.deeplang.infra.data.remote

import ai.deeplang.infra.data.contracts.DevicesResponse
import ai.deeplang.infra.data.contracts.LoginEventsResponse
import ai.deeplang.infra.data.contracts.MeResponse
import ai.deeplang.infra.data.contracts.RefreshRequest
import ai.deeplang.infra.data.contracts.RefreshResponse
import ai.deeplang.infra.data.contracts.RequestOtpRequest
import ai.deeplang.infra.data.contracts.RequestOtpResponse
import ai.deeplang.infra.data.contracts.VerifyOtpRequest
import ai.deeplang.infra.data.contracts.VerifyOtpResponse
import retrofit2.Call
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * Retrofit binding for the auth routes. Paths mirror `AUTH_ROUTES`. Methods return `Response<T>`
 * so the client can read the typed error body on non-2xx instead of relying on `HttpException`.
 */
interface AuthApi {
    @POST("/auth/otp/request")
    suspend fun requestOtp(@Body body: RequestOtpRequest): Response<RequestOtpResponse>

    @POST("/auth/otp/verify")
    suspend fun verifyOtp(@Body body: VerifyOtpRequest): Response<VerifyOtpResponse>

    @POST("/auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): Response<RefreshResponse>

    @POST("/auth/logout")
    suspend fun logout(): Response<Unit>

    @GET("/auth/me")
    suspend fun me(): Response<MeResponse>

    @GET("/auth/devices")
    suspend fun devices(): Response<DevicesResponse>

    @GET("/auth/login-events")
    suspend fun loginEvents(): Response<LoginEventsResponse>
}

/**
 * Blocking refresh used by the OkHttp [ai.deeplang.infra.data.net.TokenAuthenticator], which runs
 * on OkHttp's thread and cannot suspend. Served by a separate client with no auth interceptor or
 * authenticator, so refreshing never recurses.
 */
interface RefreshApi {
    @POST("/auth/refresh")
    fun refresh(@Body body: RefreshRequest): Call<RefreshResponse>
}
