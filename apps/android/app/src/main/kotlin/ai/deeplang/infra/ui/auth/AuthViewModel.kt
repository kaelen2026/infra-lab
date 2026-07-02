package ai.deeplang.infra.ui.auth

import ai.deeplang.infra.data.AuthClient
import ai.deeplang.infra.data.AuthException
import ai.deeplang.infra.data.contracts.AuthErrorCode
import ai.deeplang.infra.data.contracts.OtpLimits
import ai.deeplang.infra.di.ServiceLocator
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Owns the OTP login flow: all state, SDK calls and input normalization (the Kotlin analogue of
 * the web `useOtpLogin` hook). Exposes a single [AuthUiState] stream the screen collects.
 */
class AuthViewModel(private val auth: AuthClient) : ViewModel() {

    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    private var cooldownJob: Job? = null

    /**
     * Restore a session on launch: try `/auth/me`, refreshing once on 401. Mirrors the web
     * `SessionProvider` mount effect and the iOS `bootstrap()`. Always clears [AuthUiState.restoring].
     */
    fun bootstrap() {
        viewModelScope.launch {
            runCatching { auth.me() }
                .onSuccess { user -> _state.update { it.copy(user = user, step = AuthStep.DONE, restoring = false) } }
                .onFailure { err ->
                    if ((err as? AuthException)?.code == AuthErrorCode.UNAUTHORIZED) {
                        restoreViaRefresh()
                    } else {
                        _state.update { it.copy(restoring = false) }
                    }
                }
        }
    }

    private suspend fun restoreViaRefresh() {
        val restored = runCatching {
            if (auth.refresh() == null) null else auth.me()
        }.getOrNull()
        if (restored != null) {
            _state.update { it.copy(user = restored, step = AuthStep.DONE, restoring = false) }
        } else {
            runCatching { auth.logout() }
            _state.update { it.copy(restoring = false) }
        }
    }

    fun setPhone(value: String) = _state.update { it.copy(phone = OtpInput.normalizePhone(value)) }

    fun setCode(value: String) = _state.update { it.copy(code = OtpInput.normalizeCode(value)) }

    fun changePhone() = _state.update { it.copy(step = AuthStep.PHONE, error = null) }

    fun sendCode() {
        val current = _state.value
        if (!current.canSend) return
        viewModelScope.launch {
            _state.update { it.copy(busy = true, error = null) }
            runCatching { auth.requestOtp(current.phone) }
                .onSuccess { res ->
                    _state.update { it.copy(busy = false, step = AuthStep.CODE) }
                    startCooldown(res.resendAfterSeconds.takeIf { s -> s > 0 } ?: OtpLimits.RESEND_COOLDOWN_SECONDS)
                }
                .onFailure { err ->
                    _state.update { it.copy(busy = false, error = AuthMessages.describe(err)) }
                }
        }
    }

    fun verify() {
        val current = _state.value
        if (!current.canVerify) return
        viewModelScope.launch {
            _state.update { it.copy(busy = true, error = null) }
            runCatching { auth.verifyOtp(current.phone, current.code) }
                .onSuccess { res ->
                    _state.update { it.copy(busy = false, step = AuthStep.DONE, user = res.user) }
                }
                .onFailure { err ->
                    _state.update { it.copy(busy = false, error = AuthMessages.describe(err)) }
                }
        }
    }

    /** Clear the session (best-effort server revoke) and return to the phone step. */
    fun logout() {
        cooldownJob?.cancel()
        viewModelScope.launch {
            runCatching { auth.logout() }
            _state.update {
                AuthUiState(restoring = false)
            }
        }
    }

    private fun startCooldown(seconds: Int) {
        cooldownJob?.cancel()
        cooldownJob = viewModelScope.launch {
            _state.update { it.copy(cooldown = seconds) }
            while (_state.value.cooldown > 0) {
                delay(1_000)
                _state.update { it.copy(cooldown = it.cooldown - 1) }
            }
        }
    }

    companion object {
        /** Builds the ViewModel with the process-wide [AuthClient] from the [ServiceLocator]. */
        val Factory: ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                AuthViewModel(ServiceLocator.authClient()) as T
        }
    }
}
