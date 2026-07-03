package dev.w3ctech.infralab.ui.qr

import dev.w3ctech.infralab.ui.components.SectionCard
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel

/**
 * Account-screen entry for QR cross-device login: the signed-in user scans the QR the web renders
 * and confirms here, signing that browser in as this user. Android goes a step beyond iOS (which
 * ships only the `approveQrLogin` client call, no scanner yet) by wiring Google's code scanner.
 */
@Composable
fun QrLoginCard(
    viewModel: QrApproveViewModel = viewModel(factory = QrApproveViewModel.Factory),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var scanError by remember { mutableStateOf<String?>(null) }

    SectionCard(title = "扫码登录网页版") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                "用手机扫描网页端的登录二维码,在此确认后网页端即可以你的账号登录。",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            when (state.status) {
                QrApproveStatus.APPROVING -> Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    Text("确认中…", style = MaterialTheme.typography.bodyMedium)
                }

                QrApproveStatus.SUCCESS -> Text(
                    text = state.message ?: "已确认。",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary,
                )

                QrApproveStatus.ERROR -> Text(
                    text = state.message ?: "确认失败,请重试。",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )

                QrApproveStatus.IDLE -> scanError?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            if (state.status != QrApproveStatus.APPROVING) {
                TextButton(
                    onClick = {
                        scanError = null
                        viewModel.reset()
                        QrScanner.scan(
                            context = context,
                            onResult = viewModel::approve,
                            onError = { scanError = it },
                        )
                    },
                ) {
                    Text(if (state.status == QrApproveStatus.SUCCESS) "再扫一次" else "扫一扫")
                }
            }
        }
    }
}
