package ai.deeplang.infra.di

import ai.deeplang.infra.BuildConfig
import ai.deeplang.infra.data.AuthClient
import ai.deeplang.infra.data.AuthClientImpl
import ai.deeplang.infra.data.DeviceInfoProvider
import ai.deeplang.infra.data.TodoClient
import ai.deeplang.infra.data.TodoClientImpl
import ai.deeplang.infra.data.net.NetworkModule
import ai.deeplang.infra.data.token.EncryptedTokenStore
import ai.deeplang.infra.data.token.TokenStore
import android.content.Context

/**
 * Tiny manual DI container — enough for a single-feature app, with no framework dependency.
 * Holds process-wide singletons; initialized once from [ai.deeplang.infra.InfraApp].
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
