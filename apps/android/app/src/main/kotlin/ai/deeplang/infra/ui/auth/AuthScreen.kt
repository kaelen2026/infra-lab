package ai.deeplang.infra.ui.auth

import ai.deeplang.infra.data.contracts.OtpLimits
import ai.deeplang.infra.ui.theme.InfraTheme
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.togetherWith
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.tooling.preview.Preview
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel

@Composable
fun AuthScreen(
    viewModel: AuthViewModel = viewModel(factory = AuthViewModel.Factory),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    AuthScreenContent(
        state = state,
        onPhoneChange = viewModel::setPhone,
        onCodeChange = viewModel::setCode,
        onSend = viewModel::sendCode,
        onVerify = viewModel::verify,
        onChangePhone = viewModel::changePhone,
    )
}

/** Stateless content — easy to preview and to drive in tests. */
@Composable
fun AuthScreenContent(
    state: AuthUiState,
    onPhoneChange: (String) -> Unit,
    onCodeChange: (String) -> Unit,
    onSend: () -> Unit,
    onVerify: () -> Unit,
    onChangePhone: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .imePadding()
            .padding(horizontal = 24.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = AuthCopyGenerated.PHONE_TITLE,
            style = MaterialTheme.typography.headlineMedium,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = AuthCopyGenerated.PHONE_DESCRIPTION,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
        )
        Spacer(Modifier.height(32.dp))

        AnimatedContent(
            targetState = state.step,
            transitionSpec = { fadeIn() togetherWith fadeOut() },
            label = "auth-step",
        ) { step ->
            when (step) {
                AuthStep.PHONE -> PhoneStep(state, onPhoneChange, onSend)
                AuthStep.CODE -> CodeStep(state, onCodeChange, onVerify, onSend, onChangePhone)
                AuthStep.DONE -> DoneStep(state)
            }
        }

        if (state.error != null) {
            Spacer(Modifier.height(16.dp))
            Text(
                text = state.error,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

@Composable
private fun PhoneStep(
    state: AuthUiState,
    onPhoneChange: (String) -> Unit,
    onSend: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        OutlinedTextField(
            value = state.phone,
            onValueChange = onPhoneChange,
            label = { Text(AuthCopyGenerated.PHONE_LABEL) },
            placeholder = { Text(AuthCopyGenerated.PHONE_PLACEHOLDER) },
            singleLine = true,
            enabled = !state.busy,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(20.dp))
        PrimaryButton(text = AuthCopyGenerated.PHONE_SUBMIT, enabled = state.canSend, busy = state.busy, onClick = onSend)
    }
}

@Composable
private fun CodeStep(
    state: AuthUiState,
    onCodeChange: (String) -> Unit,
    onVerify: () -> Unit,
    onResend: () -> Unit,
    onChangePhone: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = AuthCopyGenerated.codeDescription(state.phone, OtpLimits.TTL_SECONDS / 60),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
        )
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(
            value = state.code,
            onValueChange = onCodeChange,
            label = { Text(AuthCopyGenerated.CODE_LABEL) },
            singleLine = true,
            enabled = !state.busy,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(20.dp))
        PrimaryButton(text = AuthCopyGenerated.CODE_SUBMIT, enabled = state.canVerify, busy = state.busy, onClick = onVerify)
        Spacer(Modifier.height(4.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            TextButton(onClick = onChangePhone, enabled = !state.busy) {
                Text(AuthCopyGenerated.CODE_CHANGE_PHONE)
            }
            TextButton(onClick = onResend, enabled = state.canResend) {
                Text(if (state.cooldown > 0) AuthCopyGenerated.resendCooldown(state.cooldown) else AuthCopyGenerated.CODE_RESEND)
            }
        }
    }
}

@Composable
private fun DoneStep(state: AuthUiState) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = AuthCopyGenerated.DONE_TITLE,
            style = MaterialTheme.typography.headlineSmall,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = "欢迎，${state.displayName ?: "用户"}",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
        )
    }
}

@Composable
private fun PrimaryButton(text: String, enabled: Boolean, busy: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth(),
    ) {
        if (busy) {
            CircularProgressIndicator(
                modifier = Modifier.height(20.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onPrimary,
            )
        } else {
            Text(text)
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun PhoneStepPreview() {
    InfraTheme {
        AuthScreenContent(
            state = AuthUiState(step = AuthStep.PHONE, phone = "+8613800138000"),
            onPhoneChange = {}, onCodeChange = {}, onSend = {}, onVerify = {}, onChangePhone = {},
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun CodeStepPreview() {
    InfraTheme {
        AuthScreenContent(
            state = AuthUiState(step = AuthStep.CODE, phone = "+8613800138000", code = "1234", cooldown = 42),
            onPhoneChange = {}, onCodeChange = {}, onSend = {}, onVerify = {}, onChangePhone = {},
        )
    }
}
