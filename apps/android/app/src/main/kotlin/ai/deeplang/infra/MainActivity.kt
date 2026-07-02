package ai.deeplang.infra

import ai.deeplang.infra.ui.RootScreen
import ai.deeplang.infra.ui.theme.InfraTheme
import ai.deeplang.infra.ui.theme.ThemePrefs
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val themePrefs = ThemePrefs(this)
        setContent {
            // Follow the system until the user picks a theme; the choice is then persisted
            // (mirrors web's `infra.theme`). null override ⇒ track `isSystemInDarkTheme`.
            var darkOverride by remember { mutableStateOf(themePrefs.darkOverride()) }
            val isDark = darkOverride ?: isSystemInDarkTheme()

            InfraTheme(darkTheme = isDark) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    RootScreen(
                        isDark = isDark,
                        onToggleTheme = {
                            val next = !isDark
                            themePrefs.setDark(next)
                            darkOverride = next
                        },
                    )
                }
            }
        }
    }
}
