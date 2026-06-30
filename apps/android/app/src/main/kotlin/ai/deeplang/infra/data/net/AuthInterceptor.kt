package ai.deeplang.infra.data.net

import ai.deeplang.infra.data.token.TokenStore
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Attaches `Authorization: Bearer <accessToken>` when a session exists. Public routes
 * (otp/request, otp/verify) simply ignore the header server-side, so it is safe to always send.
 */
class AuthInterceptor(private val tokenStore: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val accessToken = tokenStore.load()?.accessToken
            ?: return chain.proceed(request)

        val authed = request.newBuilder()
            .header("Authorization", "Bearer $accessToken")
            .build()
        return chain.proceed(authed)
    }
}
