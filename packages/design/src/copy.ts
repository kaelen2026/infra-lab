import type { AuthErrorCode } from "@infra/shared";

/**
 * Canonical user-facing auth copy for all four clients. SINGLE SOURCE OF TRUTH.
 *
 * Every string below is taken from `apps/web` (the reference). The other clients
 * had each hand-copied (and silently drifted from) this wording — different
 * titles, different button labels, ASCII vs. fullwidth punctuation. They now all
 * GENERATE their copy from this file (see `generate.ts`), so the wording can only
 * ever change in one place.
 *
 * `{name}` placeholders are interpolated by each client at runtime; the emitters
 * preserve them verbatim so every platform formats the same sentence.
 */

/** Stable error code → display string. Network/unknown collapse to `errors.network`. */
export const ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  INVALID_REQUEST: "手机号或验证码格式不正确。",
  RESEND_COOLDOWN: "发送过于频繁，请稍后再试。",
  DAILY_LIMIT_EXCEEDED: "今日验证码发送次数已达上限。",
  IP_LIMIT_EXCEEDED: "当前网络发送过于频繁，请稍后再试。",
  LOCKED: "尝试次数过多，账号已被临时锁定，请 10 分钟后重试。",
  CODE_EXPIRED: "验证码已过期，请重新获取。",
  INVALID_CODE: "验证码错误。",
  UNAUTHORIZED: "登录状态已失效，请重新登录。",
  INVALID_REFRESH_TOKEN: "登录状态已失效，请重新登录。",
  QR_NOT_FOUND: "二维码无效或已过期，请刷新后重试。",
  QR_ALREADY_USED: "该二维码已被使用，请刷新后重试。",
  QR_NOT_APPROVED: "尚未在手机上确认登录。",
  SOCIAL_PROVIDER_DISABLED: "暂不支持该登录方式。",
  SOCIAL_TOKEN_INVALID: "第三方账号验证失败，请重试。",
  SOCIAL_ACCOUNT_ERROR: "第三方登录失败，请稍后再试。",
};

export const COPY = {
  brand: "infra-lab",
  /** One-line product tagline shown on the launch / splash screen. */
  tagline: "手机号，一步登录",

  phone: {
    title: "手机号登录",
    description: "未注册的手机号将自动创建账号。",
    label: "手机号",
    placeholder: "+8613800138000",
    submit: "获取验证码",
    submitBusy: "发送中…",
  },

  code: {
    title: "输入验证码",
    /** `{phone}` and `{minutes}` interpolated at runtime. */
    description: "验证码已发送至 {phone}，{minutes} 分钟内有效。",
    label: "6 位验证码",
    placeholder: "••••••",
    submit: "登录 / 注册",
    submitBusy: "验证中…",
    resend: "重新发送",
    /** `{seconds}` interpolated at runtime. */
    resendCooldown: "{seconds}s 后重新发送",
    changePhone: "‹ 更换手机号",
  },

  done: {
    title: "已登录",
    newAccount: "欢迎加入，新账号已自动创建。",
    logout: "退出登录",
  },

  footer: "原生客户端（iOS / Android / HarmonyOS）将改用 Bearer accessToken + refreshToken。",

  /**
   * h5 timeline share landing (`/t/:id`). h5-only surface, so these strings are
   * NOT emitted to the native clients by `generate.ts` — they consume it straight
   * from this source like `apps/web` does.
   */
  timelineShare: {
    /** Browser tab / document title for a shared post. */
    documentTitle: "来自 infra-lab 的分享",
    openInApp: "在 app 中查看",
    loading: "加载中…",
    notFound: "该内容不存在或已被删除。",
    loadError: "加载失败，请稍后再试。",
  },

  /**
   * Login-screen consent line + labels linking to the legal documents. Rendered as
   * `{consentPrefix}《用户服务协议》{and}《隐私协议》` with the two labels as links.
   * h5/web-only surface (like `timelineShare`) — NOT emitted to the native clients,
   * which reference the pages by url via `@infra/shared` `legalUrl` instead.
   */
  legal: {
    consentPrefix: "登录 / 注册即代表你已阅读并同意",
    and: "和",
    termsLabel: "《用户服务协议》",
    privacyLabel: "《隐私协议》",
  },

  errors: {
    messages: ERROR_MESSAGES,
    network: "网络异常，请稍后再试。",
    generic: "出错了，请稍后再试。",
    /** `{base}` and `{remaining}` interpolated at runtime. */
    invalidCodeRemaining: "{base}还可尝试 {remaining} 次。",
  },
} as const;

export type AuthCopy = typeof COPY;
