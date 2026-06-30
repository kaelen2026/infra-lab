import { AuthErrorCode } from "../common/contracts";
import { HttpAuthError } from "./AuthClient";

/**
 * Stable error code → user-facing copy. Mirrors `apps/web`'s `messages.ts` so the
 * harmony client speaks the same wording as web. The single place auth copy lives.
 * A switch (not a Record literal) keeps ArkTS's no-untyped-obj-literals rule happy.
 */
function messageFor(code: AuthErrorCode): string {
  switch (code) {
    case "INVALID_REQUEST":
      return "手机号或验证码格式不正确。";
    case "RESEND_COOLDOWN":
      return "发送过于频繁，请稍后再试。";
    case "DAILY_LIMIT_EXCEEDED":
      return "今日验证码发送次数已达上限。";
    case "IP_LIMIT_EXCEEDED":
      return "当前网络发送过于频繁，请稍后再试。";
    case "LOCKED":
      return "尝试次数过多，账号已被临时锁定，请 10 分钟后重试。";
    case "CODE_EXPIRED":
      return "验证码已过期，请重新获取。";
    case "INVALID_CODE":
      return "验证码错误。";
    case "UNAUTHORIZED":
    case "INVALID_REFRESH_TOKEN":
      return "登录状态已失效，请重新登录。";
    default:
      return "出错了，请稍后再试。";
  }
}

/**
 * Map any thrown error to a display string. Network/unknown failures collapse to a
 * generic message; {@link HttpAuthError} carries a stable code (and, for wrong codes,
 * the remaining-attempts hint).
 */
export function describeAuthError(err: object): string {
  if (!(err instanceof HttpAuthError)) {
    return "网络异常，请稍后再试。";
  }
  const base: string = messageFor(err.code);
  if (err.code === "INVALID_CODE" && err.remainingAttempts !== undefined) {
    return `${base}还可尝试 ${err.remainingAttempts} 次。`;
  }
  return base;
}
