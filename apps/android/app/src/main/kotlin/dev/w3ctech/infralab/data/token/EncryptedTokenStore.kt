package dev.w3ctech.infralab.data.token

import android.content.Context
import android.content.SharedPreferences
import dev.w3ctech.infralab.data.contracts.AuthTokens
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.serialization.json.Json

/**
 * Stores tokens in [EncryptedSharedPreferences] (AES-256, key held in the Android Keystore).
 * Tokens are serialized as a single JSON blob so reads/writes are atomic per session.
 */
class EncryptedTokenStore(context: Context) : TokenStore {
    private val json = Json { ignoreUnknownKeys = true }

    private val prefs: SharedPreferences by lazy {
        val appContext = context.applicationContext
        val masterKey = MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            appContext,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    @Synchronized
    override fun load(): AuthTokens? {
        val raw = prefs.getString(KEY_TOKENS, null) ?: return null
        return runCatching { json.decodeFromString(AuthTokens.serializer(), raw) }.getOrNull()
    }

    @Synchronized
    override fun save(tokens: AuthTokens) {
        prefs.edit().putString(KEY_TOKENS, json.encodeToString(AuthTokens.serializer(), tokens)).apply()
    }

    @Synchronized
    override fun clear() {
        prefs.edit().remove(KEY_TOKENS).apply()
    }

    private companion object {
        const val PREFS_NAME = "infra_secure_session"
        const val KEY_TOKENS = "auth_tokens"
    }
}
