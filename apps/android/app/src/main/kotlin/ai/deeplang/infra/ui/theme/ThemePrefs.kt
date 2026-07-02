package ai.deeplang.infra.ui.theme

import android.content.Context

/**
 * Persists the user's light/dark override — the Android counterpart of web's `infra.theme`
 * localStorage entry. When no choice has been made the app follows the system setting; a toggle
 * writes an explicit override that survives relaunch.
 */
class ThemePrefs(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences("infra_theme", Context.MODE_PRIVATE)

    /** null ⇒ no explicit choice yet (follow the system); true/false ⇒ user override. */
    fun darkOverride(): Boolean? =
        if (prefs.contains(KEY_DARK)) prefs.getBoolean(KEY_DARK, false) else null

    fun setDark(dark: Boolean) {
        prefs.edit().putBoolean(KEY_DARK, dark).apply()
    }

    private companion object {
        const val KEY_DARK = "dark"
    }
}
