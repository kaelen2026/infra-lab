package dev.w3ctech.infralab

import dev.w3ctech.infralab.data.TodoClient
import dev.w3ctech.infralab.data.TodoException
import dev.w3ctech.infralab.data.contracts.TodoDTO
import dev.w3ctech.infralab.ui.todos.TodoViewModel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** In-memory [TodoClient] fake; newest-first, like the server. */
private class FakeTodoClient(seed: List<TodoDTO> = emptyList()) : TodoClient {
    private val items = seed.toMutableList()
    var failNext = false

    override suspend fun list(): List<TodoDTO> = maybeFail { items.toList() }

    override suspend fun create(title: String): TodoDTO = maybeFail {
        val todo = TodoDTO(id = "id-${items.size + 1}", title = title, createdAt = "t", updatedAt = "t")
        items.add(0, todo)
        todo
    }

    override suspend fun toggle(id: String, completed: Boolean): TodoDTO = maybeFail {
        val idx = items.indexOfFirst { it.id == id }
        val updated = items[idx].copy(completed = completed)
        items[idx] = updated
        updated
    }

    override suspend fun remove(id: String) {
        maybeFail { items.removeAll { it.id == id } }
    }

    private fun <T> maybeFail(block: () -> T): T {
        if (failNext) {
            failNext = false
            throw TodoException(code = null, status = 500, message = "boom")
        }
        return block()
    }
}

class TodoViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `load populates the list`() {
        val vm = TodoViewModel(FakeTodoClient(listOf(todo("a", "one"))))
        vm.load()
        assertEquals(listOf("one"), vm.state.value.todos?.map { it.title })
        assertFalse(vm.state.value.loading)
    }

    @Test
    fun `create prepends the new item`() {
        val vm = TodoViewModel(FakeTodoClient(listOf(todo("a", "old"))))
        vm.load()
        vm.create("new")
        assertEquals(listOf("new", "old"), vm.state.value.todos?.map { it.title })
    }

    @Test
    fun `create ignores a blank title`() {
        val client = FakeTodoClient()
        val vm = TodoViewModel(client)
        vm.load()
        vm.create("   ")
        assertEquals(emptyList<String>(), vm.state.value.todos?.map { it.title })
    }

    @Test
    fun `toggle replaces the item in place`() {
        val vm = TodoViewModel(FakeTodoClient(listOf(todo("a", "task"))))
        vm.load()
        vm.toggle(vm.state.value.todos!!.first())
        assertTrue(vm.state.value.todos!!.first().completed)
        assertTrue(vm.state.value.pendingIds.isEmpty())
    }

    @Test
    fun `remove drops the item`() {
        val vm = TodoViewModel(FakeTodoClient(listOf(todo("a", "task"))))
        vm.load()
        vm.remove("a")
        assertEquals(emptyList<String>(), vm.state.value.todos?.map { it.title })
    }

    @Test
    fun `a failed load surfaces a generic error`() {
        val client = FakeTodoClient().apply { failNext = true }
        val vm = TodoViewModel(client)
        vm.load()
        assertNull(vm.state.value.todos)
        assertEquals("无法加载待办，请稍后重试。", vm.state.value.error)
    }

    private fun todo(id: String, title: String) =
        TodoDTO(id = id, title = title, createdAt = "t", updatedAt = "t")
}
