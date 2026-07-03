package dev.w3ctech.infralab.data.net

import dev.w3ctech.infralab.data.contracts.RefreshRequest
import dev.w3ctech.infralab.data.remote.RefreshApi
import dev.w3ctech.infralab.data.token.TokenStore
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

/**
 * On a 401 from a protected route, rotates the refresh token once and retries the original
 * request with the new access token. Gives up (returns null ⇒ the 401 propagates) when there is
 * no refresh token, the refresh itself fails, or we have already retried.
 *
 * Runs on OkHttp's thread, so it refreshes via the blocking [RefreshApi] on a client that has
 * neither this authenticator nor [AuthInterceptor] — refreshing can never recurse.
 */
class TokenAuthenticator(
    private val tokenStore: TokenStore,
    private val refreshApi: RefreshApi,
) : Authenticator {

    private val lock = Any()

    override fun authenticate(route: Route?, response: Response): Request? {
        // Never try to refresh the refresh call itself, and never loop.
        if (response.request.url.encodedPath.endsWith("/auth/refresh")) return null
        if (responseCount(response) >= 2) return null

        synchronized(lock) {
            val current = tokenStore.load() ?: return null
            val sentAuth = response.request.header("Authorization")

            // Another thread may have already refreshed while this request was in flight — if so,
            // just retry with the now-current access token instead of rotating again.
            if (sentAuth != null && sentAuth != "Bearer ${current.accessToken}") {
                return response.request.retryWith(current.accessToken)
            }

            val refreshed = runCatching {
                refreshApi.refresh(RefreshRequest(current.refreshToken)).execute()
            }.getOrNull()

            val newTokens = refreshed?.takeIf { it.isSuccessful }?.body()?.tokens
            if (newTokens == null) {
                // Refresh token is unknown/expired/revoked — the session is dead.
                tokenStore.clear()
                return null
            }

            tokenStore.save(newTokens)
            return response.request.retryWith(newTokens.accessToken)
        }
    }

    private fun Request.retryWith(accessToken: String): Request =
        newBuilder().header("Authorization", "Bearer $accessToken").build()

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}
