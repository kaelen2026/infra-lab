/**
 * ArkTS mirror of `@infra/shared`'s auth contracts
 * (`packages/shared/src/contracts/auth.ts`) — the single source of truth shared by
 * the API and all four clients (web / ios / android / harmony).
 *
 * HarmonyOS can't import the TS package directly, so these shapes are hand-mirrored.
 * Keep field names byte-for-byte identical to the server DTOs: they are the JSON wire
 * format. If the shared contract changes, change this file in the same PR.
 */

export type Platform = "web" | "ios" | "android" | "harmony";

export interface OtpLimits {
  codeLength: number;
  ttlSeconds: number;
  resendCooldownSeconds: number;
  dailyPerPhone: number;
  hourlyPerIp: number;
  maxAttempts: number;
  lockSeconds: number;
}

export const OTP_LIMITS: OtpLimits = {
  codeLength: 6,
  ttlSeconds: 300,
  resendCooldownSeconds: 60,
  dailyPerPhone: 10,
  hourlyPerIp: 30,
  maxAttempts: 5,
  lockSeconds: 600,
};

/** Stable, client-switchable error codes (mirrors AUTH_ERROR_CODES). */
export type AuthErrorCode =
  | "INVALID_REQUEST"
  | "RESEND_COOLDOWN"
  | "DAILY_LIMIT_EXCEEDED"
  | "IP_LIMIT_EXCEEDED"
  | "LOCKED"
  | "CODE_EXPIRED"
  | "INVALID_CODE"
  | "UNAUTHORIZED"
  | "INVALID_REFRESH_TOKEN";

export interface AuthRoutes {
  requestOtp: string;
  verifyOtp: string;
  refresh: string;
  logout: string;
  me: string;
}

/** Endpoint paths — never hard-code strings elsewhere. */
export const AUTH_ROUTES: AuthRoutes = {
  requestOtp: "/auth/otp/request",
  verifyOtp: "/auth/otp/verify",
  refresh: "/auth/refresh",
  logout: "/auth/logout",
  me: "/auth/me",
};

export interface DeviceInfo {
  platform: Platform;
  /** Stable per-install identifier supplied by the client. */
  deviceId: string;
  model?: string;
  osVersion?: string;
  appVersion?: string;
  pushToken?: string;
}

export interface RequestOtpInput {
  phone: string;
  platform: Platform;
}

export interface RequestOtpResponse {
  ok: boolean;
  /** TTL of the freshly issued code. */
  ttlSeconds: number;
  /** Client must wait this long before requesting again. */
  resendAfterSeconds: number;
  /** Present only when OTP_DEBUG_RETURN_CODE is on (dev). Never in production. */
  debugCode?: string;
}

export interface VerifyOtpInput {
  phone: string;
  code: string;
  platform: Platform;
  device?: DeviceInfo;
}

export interface AuthUser {
  id: string;
  phone: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  /** true when this verification just created the account. */
  isNew: boolean;
}

export interface AuthTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
  tokenType: string;
}

/**
 * Native carries `tokens` (Bearer accessToken + opaque refreshToken); web omits them
 * because the session rides an HttpOnly cookie. HarmonyOS is a native client.
 */
export interface VerifyOtpResponse {
  ok: boolean;
  user: AuthUser;
  tokens?: AuthTokens;
}

export interface RefreshResponse {
  ok: boolean;
  tokens: AuthTokens;
}

export interface MeResponse {
  ok: boolean;
  user: AuthUser;
}

/** Error body shape returned by the API on non-2xx (mirrors AuthError). */
export interface AuthErrorBody {
  code?: AuthErrorCode;
  message?: string;
  retryAfter?: number;
  remainingAttempts?: number;
}
