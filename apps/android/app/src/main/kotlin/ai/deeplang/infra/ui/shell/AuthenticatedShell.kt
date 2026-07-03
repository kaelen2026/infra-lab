package ai.deeplang.infra.ui.shell

import ai.deeplang.infra.data.contracts.AuthUser
import ai.deeplang.infra.ui.account.AccountScreen
import ai.deeplang.infra.ui.auth.AuthCopyGenerated
import ai.deeplang.infra.ui.timeline.TimelineScreen
import ai.deeplang.infra.ui.todos.TodosScreen
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/** The signed-in business screens, mirroring web's `/` (account), `/todos` and `/timeline`. */
private enum class Tab(val label: String) { ACCOUNT("账户"), TODOS("待办"), TIMELINE("动态") }

/**
 * The signed-in surface — the Android counterpart of web's `AppShell`: a top bar (brand + theme
 * toggle + logout) over the current tab, with a bottom tab bar switching account / todos / timeline.
 */
@Composable
fun AuthenticatedShell(
    user: AuthUser?,
    isDark: Boolean,
    onToggleTheme: () -> Unit,
    onLogout: () -> Unit,
) {
    var tab by rememberSaveable { mutableStateOf(Tab.ACCOUNT) }

    Column(modifier = Modifier.fillMaxSize()) {
        TopBar(isDark = isDark, onToggleTheme = onToggleTheme, onLogout = onLogout)
        HorizontalDivider(color = MaterialTheme.colorScheme.outline)

        Box(modifier = Modifier.weight(1f)) {
            when (tab) {
                Tab.ACCOUNT -> AccountScreen(user = user)
                Tab.TODOS -> TodosScreen()
                Tab.TIMELINE -> TimelineScreen()
            }
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
        BottomTabs(selected = tab, onSelect = { tab = it })
    }
}

@Composable
private fun TopBar(isDark: Boolean, onToggleTheme: () -> Unit, onLogout: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = AuthCopyGenerated.BRAND,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.primary,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onToggleTheme) {
                Text(if (isDark) "浅色" else "深色")
            }
            TextButton(onClick = onLogout) {
                Text(AuthCopyGenerated.DONE_LOGOUT)
            }
        }
    }
}

@Composable
private fun BottomTabs(selected: Tab, onSelect: (Tab) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Tab.entries.forEach { tab ->
            val active = tab == selected
            val tint = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
            val fill = if (active) {
                MaterialTheme.colorScheme.primary.copy(alpha = 0.08f)
            } else {
                MaterialTheme.colorScheme.surface
            }
            Text(
                text = tab.label,
                style = MaterialTheme.typography.labelLarge,
                textAlign = TextAlign.Center,
                color = tint,
                modifier = Modifier
                    .weight(1f)
                    .clickable { onSelect(tab) }
                    .background(fill)
                    .padding(vertical = 14.dp),
            )
        }
    }
}
