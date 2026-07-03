import { HttpAuthError } from "@infra/sdk";

/**
 * Turn any thrown error into a single user-facing line. {@link HttpAuthError}
 * carries a stable code plus retry/lockout hints from the API; everything else
 * (network, unexpected) degrades to its message. Never surfaces tokens or bodies.
 */
export function formatError(err: unknown): string {
  if (err instanceof HttpAuthError) {
    const hint =
      err.retryAfter !== undefined
        ? `,请 ${err.retryAfter}s 后重试`
        : err.remainingAttempts !== undefined
          ? `,剩余尝试次数 ${err.remainingAttempts}`
          : "";
    return `${MESSAGES[err.code] ?? err.code}${hint}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

const MESSAGES: Record<string, string> = {
  INVALID_REQUEST: "请求无效(请检查手机号/验证码格式)",
  RESEND_COOLDOWN: "验证码发送过于频繁",
  DAILY_LIMIT_EXCEEDED: "该手机号今日验证码次数已达上限",
  IP_LIMIT_EXCEEDED: "当前网络请求验证码过于频繁",
  LOCKED: "验证码错误次数过多,账号已临时锁定",
  CODE_EXPIRED: "验证码已过期,请重新获取",
  INVALID_CODE: "验证码错误",
  UNAUTHORIZED: "未授权,请先登录",
  INVALID_REFRESH_TOKEN: "会话已失效,请重新登录",
};
