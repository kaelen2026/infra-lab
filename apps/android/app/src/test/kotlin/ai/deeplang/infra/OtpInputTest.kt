package ai.deeplang.infra

import ai.deeplang.infra.ui.auth.OtpInput
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OtpInputTest {
    @Test
    fun `normalizeCode keeps only digits and caps at the code length`() {
        assertEquals("123456", OtpInput.normalizeCode("12-34 56 78"))
        assertEquals("123456", OtpInput.normalizeCode("123456789"))
        assertEquals("", OtpInput.normalizeCode("abc"))
    }

    @Test
    fun `normalizePhone trims surrounding whitespace`() {
        assertEquals("+8613800138000", OtpInput.normalizePhone("  +8613800138000 "))
    }

    @Test
    fun `canSend requires at least eight digits`() {
        assertFalse(OtpInput.canSend("+86"))
        assertTrue(OtpInput.canSend("+8613800138000"))
    }

    @Test
    fun `canVerify requires exactly the full code length`() {
        assertFalse(OtpInput.canVerify("1234"))
        assertTrue(OtpInput.canVerify("123456"))
    }
}
