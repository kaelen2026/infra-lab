package dev.w3ctech.infralab.ui.todos

import dev.w3ctech.infralab.data.TodoClient
import dev.w3ctech.infralab.data.contracts.TodoDTO
import dev.w3ctech.infralab.data.contracts.TodoInput
import dev.w3ctech.infralab.di.ServiceLocator
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Owns the current user's todo list plus its create/toggle/delete mutations — the Kotlin
 * counterpart of web's `useTodos` hook. Mutations update local state from the server's returned
 * DTO (no full re-fetch), keeping the list authoritative without a flash.
 */
data class TodoUiState(
    /** null until the first load resolves; drives the loading skeleton. */
    val todos: List<TodoDTO>? = null,
    val error: String? = null,
    /** True while a create is in flight (disables the add form). */
    val creating: Boolean = false,
    /** Ids with a toggle/delete in flight (disables that row). */
    val pendingIds: Set<String> = emptySet(),
) {
    val loading: Boolean get() = error == null && todos == null
}

class TodoViewModel(private val client: TodoClient) : ViewModel() {

    private val _state = MutableStateFlow(TodoUiState())
    val state: StateFlow<TodoUiState> = _state.asStateFlow()

    fun load() {
        viewModelScope.launch {
            runCatching { client.list() }
                .onSuccess { todos -> _state.update { it.copy(todos = todos, error = null) } }
                .onFailure { _state.update { it.copy(error = "无法加载待办，请稍后重试。") } }
        }
    }

    fun create(rawTitle: String) {
        val title = TodoInput.normalizeTitle(rawTitle)
        if (title.isEmpty()) return
        viewModelScope.launch {
            _state.update { it.copy(creating = true, error = null) }
            runCatching { client.create(title) }
                .onSuccess { created ->
                    // List is newest-first; the new item leads.
                    _state.update { it.copy(creating = false, todos = listOf(created) + (it.todos ?: emptyList())) }
                }
                .onFailure { _state.update { it.copy(creating = false, error = "创建失败，请重试。") } }
        }
    }

    fun toggle(todo: TodoDTO) {
        withPending(todo.id) {
            runCatching { client.toggle(todo.id, !todo.completed) }
                .onSuccess { updated ->
                    _state.update { s -> s.copy(todos = s.todos?.map { if (it.id == updated.id) updated else it }) }
                }
                .onFailure { _state.update { it.copy(error = "更新失败，请重试。") } }
        }
    }

    fun remove(id: String) {
        withPending(id) {
            runCatching { client.remove(id) }
                .onSuccess { _state.update { s -> s.copy(todos = s.todos?.filter { it.id != id }) } }
                .onFailure { _state.update { it.copy(error = "删除失败，请重试。") } }
        }
    }

    private fun withPending(id: String, block: suspend () -> Unit) {
        viewModelScope.launch {
            _state.update { it.copy(pendingIds = it.pendingIds + id, error = null) }
            try {
                block()
            } finally {
                _state.update { it.copy(pendingIds = it.pendingIds - id) }
            }
        }
    }

    companion object {
        val Factory: ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                TodoViewModel(ServiceLocator.todoClient()) as T
        }
    }
}
