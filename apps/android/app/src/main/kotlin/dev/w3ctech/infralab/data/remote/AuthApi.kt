package dev.w3ctech.infralab.data.remote

import dev.w3ctech.infralab.data.contracts.ApproveQrLoginRequest
import dev.w3ctech.infralab.data.contracts.DevicesResponse
import dev.w3ctech.infralab.data.contracts.LoginEventsResponse
import dev.w3ctech.infralab.data.contracts.MeResponse
import dev.w3ctech.infralab.data.contracts.RefreshRequest
import dev.w3ctech.infralab.data.contracts.RefreshResponse
import dev.w3ctech.infralab.data.contracts.RequestOtpRequest
import dev.w3ctech.infralab.data.contracts.RequestOtpResponse
import dev.w3ctech.infralab.data.contracts.VerifyOtpRequest
import dev.w3ctech.infralab.data.contracts.VerifyOtpResponse
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

    /** Approve a scanned QR login ticket; the current Bearer session authenticates the approval. */
    @POST("/auth/qr/approve")
    suspend fun approveQrLogin(@Body body: ApproveQrLoginRequest): Response<Unit>
}

/**
 * Blocking refresh used by the OkHttp [dev.w3ctech.infralab.data.net.TokenAuthenticator], which runs
 * on OkHttp's thread and cannot suspend. Served by a separate client with no auth interceptor or
 * authenticator, so refreshing never recurses.
 */
interface RefreshApi {
    @POST("/auth/refresh")
    fun refresh(@Body body: RefreshRequest): Call<RefreshResponse>
}
