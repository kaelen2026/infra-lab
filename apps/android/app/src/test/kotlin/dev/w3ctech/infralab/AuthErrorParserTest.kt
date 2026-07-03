package dev.w3ctech.infralab

import dev.w3ctech.infralab.data.AuthErrorParser
import dev.w3ctech.infralab.data.contracts.AuthErrorCode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AuthErrorParserTest {
    @Test
    fun `parses the typed error envelope including hints`() {
        val body = """{"ok":false,"code":"INVALID_CODE","message":"bad","remainingAttempts":3}"""
        val ex = AuthErrorParser.parse(401, body)
        assertEquals(AuthErrorCode.INVALID_CODE, ex.code)
        assertEquals(401, ex.status)
        assertEquals("bad", ex.message)
        assertEquals(3, ex.remainingAttempts)
    }

    @Test
    fun `carries retryAfter for cooldown and lock errors`() {
        val ex = AuthErrorParser.parse(429, """{"ok":false,"code":"RESEND_COOLDOWN","retryAfter":42}""")
        assertEquals(AuthErrorCode.RESEND_COOLDOWN, ex.code)
        assertEquals(42, ex.retryAfter)
    }

    @Test
    fun `tolerates empty or malformed bodies`() {
        val ex = AuthErrorParser.parse(500, null)
        assertNull(ex.code)
        assertEquals(500, ex.status)

        val garbled = AuthErrorParser.parse(502, "<html>bad gateway</html>")
        assertNull(garbled.code)
    }
}
