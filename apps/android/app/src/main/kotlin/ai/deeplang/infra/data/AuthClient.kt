package ai.deeplang.infra.data

import ai.deeplang.infra.data.contracts.AuthTokens
import ai.deeplang.infra.data.contracts.AuthUser
import ai.deeplang.infra.data.contracts.DeviceDTO
import ai.deeplang.infra.data.contracts.LoginEventDTO
import ai.deeplang.infra.data.contracts.RequestOtpResponse
import ai.deeplang.infra.data.contracts.VerifyOtpResponse

/**
 * The shape every platform SDK implements (mirrors the shared `AuthClient` interface). Android's
 * transport is OkHttp/Retrofit + Bearer tokens persisted in EncryptedSharedPreferences, with an
 * OkHttp Authenticator transparently refreshing on 401.
 *
 * Calls throw [AuthException] on a non-2xx response.
 */
interface AuthClient {
    suspend fun requestOtp(phone: String): RequestOtpResponse

    /** Login == register: a brand-new phone is created on the server on first verify. */
    suspend fun verifyOtp(phone: String, code: String): VerifyOtpResponse

    /** Rotate the stored refresh token, or null when there is none / it is expired/revoked. */
    suspend fun refresh(): AuthTokens?

    suspend fun me(): AuthUser

    /** Registered client installs for the current user (account dashboard). */
    suspend fun listDevices(): List<DeviceDTO>

    /** Recent OTP verification attempts for the current user (account dashboard). */
    suspend fun listLoginEvents(): List<LoginEventDTO>

    suspend fun logout()
}
