package dev.w3ctech.infralab.di

import dev.w3ctech.infralab.BuildConfig
import dev.w3ctech.infralab.data.AuthClient
import dev.w3ctech.infralab.data.AuthClientImpl
import dev.w3ctech.infralab.data.DeviceInfoProvider
import dev.w3ctech.infralab.data.TodoClient
import dev.w3ctech.infralab.data.TodoClientImpl
import dev.w3ctech.infralab.data.net.NetworkModule
import dev.w3ctech.infralab.data.token.EncryptedTokenStore
import dev.w3ctech.infralab.data.token.TokenStore
import android.content.Context

/**
 * Tiny manual DI container — enough for a single-feature app, with no framework dependency.
 * Holds process-wide singletons; initialized once from [dev.w3ctech.infralab.InfraApp].
 */
object ServiceLocator {
    @Volatile
    private var authClient: AuthClient? = null

    @Volatile
    private var todoClient: TodoClient? = null

    @Volatile
    private var tokenStore: TokenStore? = null

    fun init(context: Context) {
        val appContext = context.applicationContext
        val tokens = EncryptedTokenStore(appContext)
        val network = NetworkModule(
            baseUrl = BuildConfig.API_BASE_URL,
            tokenStore = tokens,
            enableLogging = BuildConfig.DEBUG,
        )
        tokenStore = tokens
        authClient = AuthClientImpl(
            api = network.authApi,
            tokenStore = tokens,
            device = DeviceInfoProvider(appContext),
        )
        todoClient = TodoClientImpl(api = network.todoApi)
    }

    fun authClient(): AuthClient =
        authClient ?: error("ServiceLocator.init() must be called before authClient()")

    fun todoClient(): TodoClient =
        todoClient ?: error("ServiceLocator.init() must be called before todoClient()")

    fun tokenStore(): TokenStore =
        tokenStore ?: error("ServiceLocator.init() must be called before tokenStore()")
}
