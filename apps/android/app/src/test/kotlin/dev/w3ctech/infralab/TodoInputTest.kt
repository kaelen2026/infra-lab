package dev.w3ctech.infralab

import dev.w3ctech.infralab.data.contracts.TodoInput
import dev.w3ctech.infralab.data.contracts.TodoLimits
import org.junit.Assert.assertEquals
import org.junit.Test

class TodoInputTest {
    @Test
    fun `normalizeTitle trims surrounding whitespace`() {
        assertEquals("买牛奶", TodoInput.normalizeTitle("  买牛奶 \n"))
    }

    @Test
    fun `normalizeTitle clamps to the max length`() {
        val long = "x".repeat(TodoLimits.MAX_TITLE_LENGTH + 50)
        assertEquals(TodoLimits.MAX_TITLE_LENGTH, TodoInput.normalizeTitle(long).length)
    }

    @Test
    fun `normalizeTitle collapses to empty for blank input`() {
        assertEquals("", TodoInput.normalizeTitle("   "))
    }
}
