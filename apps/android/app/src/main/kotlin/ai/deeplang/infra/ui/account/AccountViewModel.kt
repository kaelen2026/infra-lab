package ai.deeplang.infra.ui.account

import ai.deeplang.infra.data.AuthClient
import ai.deeplang.infra.data.contracts.DeviceDTO
import ai.deeplang.infra.data.contracts.LoginEventDTO
import ai.deeplang.infra.di.ServiceLocator
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Loads the current user's devices + login history for the account screen — the Kotlin
 * counterpart of web's `useAccountData` hook. Both lists load concurrently; any failure collapses
 * to a generic message (the UI never branches on the error).
 */
data class AccountUiState(
    val devices: List<DeviceDTO>? = null,
    val events: List<LoginEventDTO>? = null,
    val error: String? = null,
) {
    val loading: Boolean get() = error == null && (devices == null || events == null)
}

class AccountViewModel(private val client: AuthClient) : ViewModel() {

    private val _state = MutableStateFlow(AccountUiState())
    val state: StateFlow<AccountUiState> = _state.asStateFlow()

    /** Load devices + login history concurrently. */
    fun load() {
        viewModelScope.launch {
            runCatching {
                val devices = async { client.listDevices() }
                val events = async { client.listLoginEvents() }
                devices.await() to events.await()
            }.onSuccess { (devices, events) ->
                _state.update { it.copy(devices = devices, events = events, error = null) }
            }.onFailure {
                _state.update { it.copy(error = "无法加载账户数据，请稍后重试。") }
            }
        }
    }

    companion object {
        val Factory: ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                AccountViewModel(ServiceLocator.authClient()) as T
        }
    }
}
