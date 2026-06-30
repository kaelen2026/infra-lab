import { HttpAuthError } from "@infra/sdk";
import type { AuthErrorCode } from "@infra/shared";

/** Stable error code → user-facing copy. The single place auth wording lives. */
const ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  INVALID_REQUEST: "手机号或验证码格式不正确。",
  RESEND_COOLDOWN: "发送过于频繁，请稍后再试。",
  DAILY_LIMIT_EXCEEDED: "今日验证码发送次数已达上限。",
  IP_LIMIT_EXCEEDED: "当前网络发送过于频繁，请稍后再试。",
  LOCKED: "尝试次数过多，账号已被临时锁定，请 10 分钟后重试。",
  CODE_EXPIRED: "验证码已过期，请重新获取。",
  INVALID_CODE: "验证码错误。",
  UNAUTHORIZED: "登录状态已失效，请重新登录。",
  INVALID_REFRESH_TOKEN: "登录状态已失效，请重新登录。",
};

/**
 * Map any thrown error from the auth SDK to a display string. Network/unknown
 * failures collapse to a generic message; {@link HttpAuthError} carries a stable
 * code (and, for wrong codes, the remaining-attempts hint).
 */
export function describeAuthError(err: unknown): string {
  if (!(err instanceof HttpAuthError)) return "网络异常，请稍后再试。";
  const base = ERROR_MESSAGES[err.code] ?? "出错了，请稍后再试。";
  if (err.code === "INVALID_CODE" && typeof err.remainingAttempts === "number") {
    return `${base}还可尝试 ${err.remainingAttempts} 次。`;
  }
  return base;
}
