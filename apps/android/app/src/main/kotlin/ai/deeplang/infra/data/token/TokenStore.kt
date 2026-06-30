package ai.deeplang.infra.data.token

import ai.deeplang.infra.data.contracts.AuthTokens

/** Persists the native session's Bearer tokens. Implementations must be thread-safe. */
interface TokenStore {
    fun load(): AuthTokens?
    fun save(tokens: AuthTokens)
    fun clear()
    fun isLoggedIn(): Boolean = load() != null
}
