package dev.w3ctech.infralab.ui

import dev.w3ctech.infralab.ui.auth.AuthScreen
import dev.w3ctech.infralab.ui.auth.AuthStep
import dev.w3ctech.infralab.ui.auth.AuthViewModel
import dev.w3ctech.infralab.ui.shell.AuthenticatedShell
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel

/**
 * Top-level view: restores the session on launch, then routes to the current step — the phone /
 * code auth flow, or the signed-in shell (account + todos). Mirrors iOS's `RootView` and web's
 * `SessionProvider` + `RequireAuth`.
 */
@Composable
fun RootScreen(
    isDark: Boolean,
    onToggleTheme: () -> Unit,
    authViewModel: AuthViewModel = viewModel(factory = AuthViewModel.Factory),
) {
    val state by authViewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { authViewModel.bootstrap() }

    when {
        state.restoring -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        state.step == AuthStep.DONE -> AuthenticatedShell(
            user = state.user,
            isDark = isDark,
            onToggleTheme = onToggleTheme,
            onLogout = authViewModel::logout,
        )
        else -> AuthScreen(viewModel = authViewModel)
    }
}
