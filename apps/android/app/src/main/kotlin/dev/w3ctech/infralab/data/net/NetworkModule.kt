package dev.w3ctech.infralab.data.net

import dev.w3ctech.infralab.data.remote.AuthApi
import dev.w3ctech.infralab.data.remote.RefreshApi
import dev.w3ctech.infralab.data.remote.TodoApi
import dev.w3ctech.infralab.data.token.TokenStore
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Builds the Retrofit stack. Two clients on purpose:
 *  - [refreshApi] is a bare client (no auth interceptor / authenticator) used only to rotate tokens.
 *  - the main [AuthApi] client adds [AuthInterceptor] (attach Bearer) and [TokenAuthenticator]
 *    (refresh-on-401), the latter delegating to [refreshApi]. This split prevents refresh recursion.
 */
class NetworkModule(
    private val baseUrl: String,
    private val tokenStore: TokenStore,
    private val enableLogging: Boolean,
) {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    private val converterFactory = json.asConverterFactory(JSON_MEDIA_TYPE)

    private val normalizedBaseUrl: String = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"

    private fun loggingInterceptor() = HttpLoggingInterceptor().apply {
        level = if (enableLogging) HttpLoggingInterceptor.Level.BODY else HttpLoggingInterceptor.Level.NONE
        // Tokens are sensitive — never log the Authorization header.
        redactHeader("Authorization")
    }

    /** Bare client used solely by the authenticator to refresh tokens. */
    private val refreshApi: RefreshApi by lazy {
        val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .addInterceptor(loggingInterceptor())
            .build()
        retrofit(client).create(RefreshApi::class.java)
    }

    /**
     * The main authenticated client, shared by every protected API: attaches the Bearer header
     * ([AuthInterceptor]) and refreshes once on 401 ([TokenAuthenticator], via the bare
     * [refreshApi]). Building one client keeps the auth and todo transports in lock-step.
     */
    private val authedClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .addInterceptor(AuthInterceptor(tokenStore))
            .addInterceptor(loggingInterceptor())
            .authenticator(TokenAuthenticator(tokenStore, refreshApi))
            .build()
    }

    val authApi: AuthApi by lazy { retrofit(authedClient).create(AuthApi::class.java) }

    val todoApi: TodoApi by lazy { retrofit(authedClient).create(TodoApi::class.java) }

    private fun retrofit(client: OkHttpClient): Retrofit = Retrofit.Builder()
        .baseUrl(normalizedBaseUrl)
        .client(client)
        .addConverterFactory(converterFactory)
        .build()

    private companion object {
        val JSON_MEDIA_TYPE = "application/json".toMediaType()
    }
}
