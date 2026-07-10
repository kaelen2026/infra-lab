package dev.w3ctech.infralab

import dev.w3ctech.infralab.data.net.LogRedaction
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LogRedactionTest {

    @Test
    fun `redacts phone and code from an otp body line`() {
        val line = """{"phone":"+8613800138000","code":"123456","platform":"android"}"""
        val out = LogRedaction.redact(line)
        assertFalse(out.contains("13800138000"))
        assertFalse(out.contains("123456"))
        assertTrue(out.contains(""""phone":"<redacted>""""))
        assertTrue(out.contains(""""code":"<redacted>""""))
        // Non-sensitive fields survive untouched.
        assertTrue(out.contains(""""platform":"android""""))
    }

    @Test
    fun `redacts access and refresh tokens from a session body line`() {
        val line =
            """{"tokens":{"accessToken":"eyJhbGciOi.secret","refreshToken":"r0t4t3m3","tokenType":"Bearer"}}"""
        val out = LogRedaction.redact(line)
        assertFalse(out.contains("eyJhbGciOi.secret"))
        assertFalse(out.contains("r0t4t3m3"))
        assertTrue(out.contains(""""accessToken":"<redacted>""""))
        assertTrue(out.contains(""""refreshToken":"<redacted>""""))
        assertTrue(out.contains(""""tokenType":"Bearer""""))
    }

    @Test
    fun `leaves non-body log lines untouched`() {
        val line = "--> POST https://api.example.com/auth/otp/request http/1.1"
        assertEquals(line, LogRedaction.redact(line))
    }

    @Test
    fun `handles spaced json and empty values`() {
        assertEquals(
            """{"phone":"<redacted>"}""",
            LogRedaction.redact("""{"phone" : ""}"""),
        )
    }
}
