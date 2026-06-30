package ai.deeplang.infra.di

import android.content.Context
import ai.deeplang.infra.BuildConfig
import ai.deeplang.infra.data.AuthClient
import ai.deeplang.infra.data.AuthClientImpl
import ai.deeplang.infra.data.DeviceInfoProvider
import ai.deeplang.infra.data.net.NetworkModule
import ai.deeplang.infra.data.token.EncryptedTokenStore
import ai.deeplang.infra.data.token.TokenStore

/**
 * Tiny manual DI container — enough for a single-feature app, with no framework dependency.
 * Holds process-wide singletons; initialized once from [ai.deeplang.infra.InfraApp].
 */
object ServiceLocator {
    @Volatile
    private var authClient: AuthClient? = null

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
    }

    fun authClient(): AuthClient =
        authClient ?: error("ServiceLocator.init() must be called before authClient()")

    fun tokenStore(): TokenStore =
        tokenStore ?: error("ServiceLocator.init() must be called before tokenStore()")
}
