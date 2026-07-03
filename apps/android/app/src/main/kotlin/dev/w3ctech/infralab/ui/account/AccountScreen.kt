package dev.w3ctech.infralab.ui.account

import dev.w3ctech.infralab.data.contracts.AuthUser
import dev.w3ctech.infralab.data.contracts.DeviceDTO
import dev.w3ctech.infralab.data.contracts.LoginEventDTO
import dev.w3ctech.infralab.ui.Format
import dev.w3ctech.infralab.ui.components.Badge
import dev.w3ctech.infralab.ui.components.BadgeStyle
import dev.w3ctech.infralab.ui.components.ErrorBanner
import dev.w3ctech.infralab.ui.components.KeyValueRow
import dev.w3ctech.infralab.ui.components.MonoText
import dev.w3ctech.infralab.ui.components.SectionCard
import dev.w3ctech.infralab.ui.components.SkeletonBar
import dev.w3ctech.infralab.ui.qr.QrLoginCard
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel

/**
 * The account dashboard — the Android counterpart of web's account page: profile, current session,
 * registered devices and recent login history. Read-only (the logout action lives in the shell's
 * top bar, mirroring web's AppShell).
 */
@Composable
fun AccountScreen(
    user: AuthUser?,
    viewModel: AccountViewModel = viewModel(factory = AccountViewModel.Factory),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.load() }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("账户", style = MaterialTheme.typography.headlineSmall)
            Text(
                "你的资料、当前会话与登录记录。",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        user?.let { ProfileCard(it) }
        SessionCard()
        QrLoginCard()
        DevicesCard(devices = state.devices, loading = state.loading)
        LoginEventsCard(events = state.events, loading = state.loading)
        ErrorBanner(state.error)
    }
}

private fun monogram(user: AuthUser): String {
    val name = user.displayName?.trim().orEmpty()
    if (name.isNotEmpty()) return name.take(1).uppercase()
    val digits = user.phone.filter(Char::isDigit)
    return if (digits.isEmpty()) "··" else digits.takeLast(2)
}

@Composable
private fun ProfileCard(user: AuthUser) {
    SectionCard(title = "资料") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .background(MaterialTheme.colorScheme.primary, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    monogram(user),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            }
            Column(modifier = Modifier.padding(start = 16.dp)) {
                Text(
                    user.displayName ?: "未命名用户",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                MonoText(user.phone)
                MonoText("注册于 ${Format.date(user.createdAt)}")
            }
        }
    }
}

/** Current native session facts. Android rides the Bearer accessToken kept in the Keystore. */
@Composable
private fun SessionCard() {
    SectionCard(title = "当前会话") {
        KeyValueRow("平台") { Badge("Android") }
        KeyValueRow("凭证") { MonoText("Bearer · Keystore", MaterialTheme.colorScheme.onSurface) }
        KeyValueRow("状态") { Badge("活跃", BadgeStyle.SUCCESS) }
    }
}

@Composable
private fun DevicesCard(devices: List<DeviceDTO>?, loading: Boolean) {
    SectionCard(title = "设备") {
        when {
            loading -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SkeletonBar(widthFraction = 1f, height = 34)
                SkeletonBar(widthFraction = 0.66f, height = 34)
            }
            !devices.isNullOrEmpty() -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                devices.forEach { device ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column {
                            Text(
                                device.model ?: "未知机型",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            MonoText("最近 ${Format.date(device.lastSeenAt)}")
                        }
                        Badge(Format.platformLabel(device.platform))
                    }
                }
            }
            else -> Text(
                "还没有原生设备登录。iOS / Android / HarmonyOS 客户端登录后会出现在这里。",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun LoginEventsCard(events: List<LoginEventDTO>?, loading: Boolean) {
    SectionCard(title = "最近登录") {
        when {
            loading -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SkeletonBar(widthFraction = 1f, height = 28)
                SkeletonBar(widthFraction = 1f, height = 28)
                SkeletonBar(widthFraction = 0.8f, height = 28)
            }
            !events.isNullOrEmpty() -> Column {
                events.forEach { event ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(40.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        MonoText(Format.dateTime(event.createdAt))
                        Spacer(Modifier.weight(1f))
                        event.ip?.let { MonoText(it) }
                        Badge(Format.platformLabel(event.platform))
                        Badge(
                            if (event.success) "成功" else "失败",
                            if (event.success) BadgeStyle.SUCCESS else BadgeStyle.DESTRUCTIVE,
                        )
                    }
                }
            }
            else -> Text(
                "还没有登录记录。",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
