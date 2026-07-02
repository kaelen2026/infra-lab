package ai.deeplang.infra.data

import ai.deeplang.infra.data.contracts.AuthTokens
import ai.deeplang.infra.data.contracts.AuthUser
import ai.deeplang.infra.data.contracts.DeviceDTO
import ai.deeplang.infra.data.contracts.LoginEventDTO
import ai.deeplang.infra.data.contracts.Platform
import ai.deeplang.infra.data.contracts.RefreshRequest
import ai.deeplang.infra.data.contracts.RequestOtpRequest
import ai.deeplang.infra.data.contracts.RequestOtpResponse
import ai.deeplang.infra.data.contracts.VerifyOtpRequest
import ai.deeplang.infra.data.contracts.VerifyOtpResponse
import ai.deeplang.infra.data.remote.AuthApi
import ai.deeplang.infra.data.token.TokenStore
import retrofit2.Response

/**
 * Default [AuthClient]: drives the Retrofit [AuthApi], persists rotated tokens to the [TokenStore],
 * and turns non-2xx responses into typed [AuthException]s. (The OkHttp authenticator handles the
 * implicit 401-refresh-retry; the explicit [refresh] here is for pre-emptive/manual rotation.)
 */
class AuthClientImpl(
    private val api: AuthApi,
    private val tokenStore: TokenStore,
    private val device: DeviceInfoProvider,
) : AuthClient {

    override suspend fun requestOtp(phone: String): RequestOtpResponse =
        unwrap(api.requestOtp(RequestOtpRequest(phone = phone, platform = Platform.ANDROID)))

    override suspend fun verifyOtp(phone: String, code: String): VerifyOtpResponse {
        val result = unwrap(
            api.verifyOtp(
                VerifyOtpRequest(
                    phone = phone,
                    code = code,
                    platform = Platform.ANDROID,
                    device = device.current(),
                ),
            ),
        )
        result.tokens?.let(tokenStore::save)
        return result
    }

    override suspend fun refresh(): AuthTokens? {
        val refreshToken = tokenStore.load()?.refreshToken ?: return null
        val response = api.refresh(RefreshRequest(refreshToken))
        if (!response.isSuccessful) {
            tokenStore.clear()
            return null
        }
        val tokens = response.body()?.tokens ?: return null
        tokenStore.save(tokens)
        return tokens
    }

    override suspend fun me(): AuthUser = unwrap(api.me()).user

    override suspend fun listDevices(): List<DeviceDTO> = unwrap(api.devices()).devices

    override suspend fun listLoginEvents(): List<LoginEventDTO> = unwrap(api.loginEvents()).events

    override suspend fun logout() {
        // Best-effort server revoke; always drop local tokens regardless of the outcome.
        runCatching { api.logout() }
        tokenStore.clear()
    }

    private fun <T> unwrap(response: Response<T>): T {
        if (response.isSuccessful) {
            return response.body()
                ?: throw AuthException(code = null, status = response.code(), message = "Empty response body")
        }
        throw AuthErrorParser.parse(response.code(), response.errorBody()?.string())
    }
}
