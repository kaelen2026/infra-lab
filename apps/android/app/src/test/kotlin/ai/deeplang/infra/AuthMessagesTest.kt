package ai.deeplang.infra

import ai.deeplang.infra.data.AuthException
import ai.deeplang.infra.data.contracts.AuthErrorCode
import ai.deeplang.infra.ui.auth.AuthMessages
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

class AuthMessagesTest {
    @Test
    fun `maps a known code to its copy`() {
        val msg = AuthMessages.describe(AuthException(AuthErrorCode.INVALID_CODE, 401, null))
        assertEquals("验证码错误。", msg)
    }

    @Test
    fun `appends remaining attempts for a wrong code`() {
        val msg = AuthMessages.describe(
            AuthException(AuthErrorCode.INVALID_CODE, 401, null, remainingAttempts = 2),
        )
        assertTrue(msg.contains("还可尝试 2 次"))
    }

    @Test
    fun `non-auth errors collapse to the generic network message`() {
        assertEquals("网络异常，请稍后再试。", AuthMessages.describe(IOException("timeout")))
    }
}
