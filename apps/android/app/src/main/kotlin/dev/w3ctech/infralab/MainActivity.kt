package dev.w3ctech.infralab

import dev.w3ctech.infralab.ui.BrandSplash
import dev.w3ctech.infralab.ui.RootScreen
import dev.w3ctech.infralab.ui.theme.InfraTheme
import dev.w3ctech.infralab.ui.theme.ThemePrefs
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import kotlinx.coroutines.delay

// The in-app brand splash lingers briefly over RootScreen (which mounts and starts session
// restore underneath), then fades out. The system SplashScreen only shows the icon.
private const val BRAND_SPLASH_HOLD_MS = 800L
private const val BRAND_SPLASH_FADE_MS = 400

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Install the system splash (swaps Theme.Infra.Splash → Theme.Infra) before
        // super.onCreate, per the AndroidX contract; then hand off to the in-app brand
        // splash below.
        installSplashScreen()
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
                    Box(modifier = Modifier.fillMaxSize()) {
                        RootScreen(
                            isDark = isDark,
                            onToggleTheme = {
                                val next = !isDark
                                themePrefs.setDark(next)
                                darkOverride = next
                            },
                        )

                        // Brand splash overlays RootScreen (which mounts + restores the
                        // session underneath), then fades out to reveal it. Hoisted state.
                        var showSplash by remember { mutableStateOf(true) }
                        LaunchedEffect(Unit) {
                            delay(BRAND_SPLASH_HOLD_MS)
                            showSplash = false
                        }
                        AnimatedVisibility(
                            visible = showSplash,
                            exit = fadeOut(animationSpec = tween(durationMillis = BRAND_SPLASH_FADE_MS)),
                        ) {
                            BrandSplash()
                        }
                    }
                }
            }
        }
    }
}
