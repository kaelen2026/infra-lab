package ai.deeplang.infra.ui.auth

import ai.deeplang.infra.data.AuthException
import ai.deeplang.infra.data.contracts.AuthErrorCode

/**
 * Stable error code → user-facing copy. The single place auth wording lives (mirrors the web
 * `messages.ts`). Network/unknown failures collapse to a generic message.
 */
object AuthMessages {
    private val byCode: Map<AuthErrorCode, String> = mapOf(
        AuthErrorCode.INVALID_REQUEST to "手机号或验证码格式不正确。",
        AuthErrorCode.RESEND_COOLDOWN to "发送过于频繁，请稍后再试。",
        AuthErrorCode.DAILY_LIMIT_EXCEEDED to "今日验证码发送次数已达上限。",
        AuthErrorCode.IP_LIMIT_EXCEEDED to "当前网络发送过于频繁，请稍后再试。",
        AuthErrorCode.LOCKED to "尝试次数过多，账号已被临时锁定，请 10 分钟后重试。",
        AuthErrorCode.CODE_EXPIRED to "验证码已过期，请重新获取。",
        AuthErrorCode.INVALID_CODE to "验证码错误。",
        AuthErrorCode.UNAUTHORIZED to "登录状态已失效，请重新登录。",
        AuthErrorCode.INVALID_REFRESH_TOKEN to "登录状态已失效，请重新登录。",
    )

    fun describe(error: Throwable?): String {
        val authError = error as? AuthException ?: return "网络异常，请稍后再试。"
        val base = authError.code?.let(byCode::get) ?: "出错了，请稍后再试。"
        val remaining = authError.remainingAttempts
        return if (authError.code == AuthErrorCode.INVALID_CODE && remaining != null) {
            "$base 还可尝试 $remaining 次。"
        } else {
            base
        }
    }
}
