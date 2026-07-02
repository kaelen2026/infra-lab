package ai.deeplang.infra.ui.todos

import ai.deeplang.infra.data.contracts.TodoDTO
import ai.deeplang.infra.data.contracts.TodoLimits
import ai.deeplang.infra.ui.components.ErrorBanner
import ai.deeplang.infra.ui.components.SectionCard
import ai.deeplang.infra.ui.components.SkeletonBar
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel

/**
 * The todo list — the Android counterpart of web's todos page: a composer plus the per-user list
 * with a completion toggle and delete. Loaded once on first composition.
 */
@Composable
fun TodosScreen(
    viewModel: TodoViewModel = viewModel(factory = TodoViewModel.Factory),
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
            Text("待办", style = MaterialTheme.typography.headlineSmall)
            Text(
                "登录之后的第一个业务:按用户隔离的待办清单。",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        AddTodoForm(busy = state.creating, onAdd = viewModel::create)
        TodoListCard(
            todos = state.todos,
            loading = state.loading,
            pendingIds = state.pendingIds,
            onToggle = viewModel::toggle,
            onRemove = viewModel::remove,
        )
        ErrorBanner(state.error)
    }
}

@Composable
private fun AddTodoForm(busy: Boolean, onAdd: (String) -> Unit) {
    var title by remember { mutableStateOf("") }
    val canSubmit = title.trim().isNotEmpty() && !busy

    fun submit() {
        if (!canSubmit) return
        onAdd(title)
        title = ""
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OutlinedTextField(
            value = title,
            onValueChange = { if (it.length <= TodoLimits.MAX_TITLE_LENGTH) title = it },
            placeholder = { Text("添加一项待办…") },
            singleLine = true,
            enabled = !busy,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { submit() }),
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = ::submit, enabled = canSubmit) {
            if (busy) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            } else {
                Text("添加")
            }
        }
    }
}

@Composable
private fun TodoListCard(
    todos: List<TodoDTO>?,
    loading: Boolean,
    pendingIds: Set<String>,
    onToggle: (TodoDTO) -> Unit,
    onRemove: (String) -> Unit,
) {
    SectionCard(title = "清单") {
        when {
            loading -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SkeletonBar(widthFraction = 1f, height = 22)
                SkeletonBar(widthFraction = 0.75f, height = 22)
                SkeletonBar(widthFraction = 0.66f, height = 22)
            }
            !todos.isNullOrEmpty() -> Column {
                todos.forEach { todo ->
                    TodoRow(
                        todo = todo,
                        pending = pendingIds.contains(todo.id),
                        onToggle = { onToggle(todo) },
                        onRemove = { onRemove(todo.id) },
                    )
                }
            }
            else -> Text(
                "还没有待办,在上面添加第一项吧。",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 24.dp),
            )
        }
    }
}

@Composable
private fun TodoRow(
    todo: TodoDTO,
    pending: Boolean,
    onToggle: () -> Unit,
    onRemove: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val ring = if (todo.completed) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline
        val toggleLabel = if (todo.completed) "标记为未完成" else "标记为已完成"
        Box(
            modifier = Modifier
                .size(22.dp)
                .clickable(enabled = !pending, onClickLabel = toggleLabel, onClick = onToggle)
                .background(
                    if (todo.completed) MaterialTheme.colorScheme.primary else Color.Transparent,
                    CircleShape,
                )
                .border(1.5.dp, ring, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (todo.completed) {
                Text(
                    "✓",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            }
        }
        Text(
            text = todo.title,
            style = MaterialTheme.typography.bodyMedium,
            color = if (todo.completed) {
                MaterialTheme.colorScheme.onSurfaceVariant
            } else {
                MaterialTheme.colorScheme.onSurface
            },
            textDecoration = if (todo.completed) TextDecoration.LineThrough else null,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = onRemove, enabled = !pending) { Text("删除") }
    }
}
