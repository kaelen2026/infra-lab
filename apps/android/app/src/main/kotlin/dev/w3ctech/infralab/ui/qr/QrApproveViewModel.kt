package dev.w3ctech.infralab.ui.qr

import dev.w3ctech.infralab.data.AuthClient
import dev.w3ctech.infralab.di.ServiceLocator
import dev.w3ctech.infralab.ui.auth.AuthMessages
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Where the QR approval flow is in its lifecycle (drives the account-screen card). */
enum class QrApproveStatus { IDLE, APPROVING, SUCCESS, ERROR }

data class QrApproveUiState(
    val status: QrApproveStatus = QrApproveStatus.IDLE,
    /** Error copy when [status] is ERROR; success copy when SUCCESS; otherwise null. */
    val message: String? = null,
)

/**
 * Drives the native side of QR cross-device login: an already-authenticated user scans the QR the
 * web renders (its content is the public ticket id) and this approves it, binding the browser's
 * pending ticket to the current user. Mirrors iOS's `approveQrLogin` client call; scanning itself
 * lives in the UI (Google's code scanner), so this ViewModel stays framework-free and unit-testable.
 */
class QrApproveViewModel(private val auth: AuthClient) : ViewModel() {

    private val _state = MutableStateFlow(QrApproveUiState())
    val state: StateFlow<QrApproveUiState> = _state.asStateFlow()

    /** Approve the scanned [ticketId]. Blank input (a cancelled/empty scan) is ignored. */
    fun approve(ticketId: String) {
        val trimmed = ticketId.trim()
        if (trimmed.isEmpty()) return
        viewModelScope.launch {
            _state.update { it.copy(status = QrApproveStatus.APPROVING, message = null) }
            runCatching { auth.approveQrLogin(trimmed) }
                .onSuccess {
                    _state.update {
                        it.copy(status = QrApproveStatus.SUCCESS, message = "已确认,网页端即将登录。")
                    }
                }
                .onFailure { err ->
                    _state.update {
                        it.copy(status = QrApproveStatus.ERROR, message = AuthMessages.describe(err))
                    }
                }
        }
    }

    /** Return the card to its resting state (after the user dismisses a result). */
    fun reset() = _state.update { QrApproveUiState() }

    companion object {
        val Factory: ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                QrApproveViewModel(ServiceLocator.authClient()) as T
        }
    }
}
