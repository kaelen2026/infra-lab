import { z } from "zod";

/**
 * Auth contracts shared by the API and all four client SDKs (web / ios / android / harmony).
 * This is the single source of truth for request/response shapes, error codes and limits.
 */

// ── Platforms ────────────────────────────────────────────────────────────────
// `cli` is the terminal client (apps/cli). It has no cookie jar, so — like the
// native platforms — it authenticates with Bearer + refresh tokens, persisting
// them in a local credentials file. Adding it is additive: native clients only
// ever send their own value and never decode this enum, so they are unaffected.
export const PLATFORMS = ["web", "ios", "android", "harmony", "cli"] as const;
export const platformSchema = z.enum(PLATFORMS);
export type Platform = (typeof PLATFORMS)[number];

/** Web authenticates via HttpOnly cookie; every other platform via Bearer tokens. */
export function isCookiePlatform(platform: Platform): boolean {
  return platform === "web";
}

// ── Limits (mirrors the OTP service config; clients use these for UX hints) ────
export const OTP_LIMITS = {
  codeLength: 6,
  ttlSeconds: 300, // 5 minutes
  resendCooldownSeconds: 60,
  dailyPerPhone: 10,
  hourlyPerIp: 30,
  maxAttempts: 5,
  lockSeconds: 600, // 10 minutes
} as const;

// ── Phone number ──────────────────────────────────────────────────────────────
// E.164: leading + and 8–15 digits. Clients should normalize before sending.
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "phone must be E.164, e.g. +8613800138000");

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${OTP_LIMITS.codeLength}}$`), "code must be 6 digits");

// ── Error codes (stable, client-switchable) ───────────────────────────────────
export const AUTH_ERROR_CODES = [
  "INVALID_REQUEST",
  "RESEND_COOLDOWN", // sent within the 60s window
  "DAILY_LIMIT_EXCEEDED", // >10 per phone per day
  "IP_LIMIT_EXCEEDED", // >30 per IP per hour
  "LOCKED", // too many wrong attempts
  "CODE_EXPIRED", // no live code for this phone
  "INVALID_CODE", // wrong code
  "UNAUTHORIZED", // no/invalid session for a protected route
  "INVALID_REFRESH_TOKEN",
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export interface AuthError {
  code: AuthErrorCode;
  message: string;
  /** Seconds until the client may retry (cooldown / lock windows). */
  retryAfter?: number;
  /** Remaining verify attempts before lockout, when applicable. */
  remainingAttempts?: number;
}

// ── Request: send OTP ──────────────────────────────────────────────────────────
export const requestOtpSchema = z.object({
  phone: phoneSchema,
  platform: platformSchema,
});
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export interface RequestOtpResponse {
  ok: true;
  /** TTL of the freshly issued code. */
  ttlSeconds: number;
  /** Client must wait this long before requesting again. */
  resendAfterSeconds: number;
  /** Present only when OTP_DEBUG_RETURN_CODE is on (dev). Never in production. */
  debugCode?: string;
}

// ── Request: verify OTP (login == register) ────────────────────────────────────
export const deviceInfoSchema = z.object({
  platform: platformSchema,
  /** Stable per-install identifier supplied by the client. */
  deviceId: z.string().trim().min(1).max(128),
  model: z.string().trim().max(128).optional(),
  osVersion: z.string().trim().max(64).optional(),
  appVersion: z.string().trim().max(64).optional(),
  pushToken: z.string().trim().max(512).optional(),
});
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
  platform: platformSchema,
  device: deviceInfoSchema.optional(),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

// ── Request: update a device's push token ───────────────────────────────────────
// A native install acquires its APNS/FCM/HMS push token asynchronously — usually
// after login, and it can rotate independently of the session. This endpoint lets an
// already-authenticated client refresh the token on its own `device` row (matched by
// the same stable `deviceId` it sent at verify time). Never carries a secret; the
// token is an opaque, device-scoped push address.
export const updatePushTokenSchema = z.object({
  deviceId: z.string().trim().min(1).max(128),
  pushToken: z.string().trim().min(1).max(512),
});
export type UpdatePushTokenInput = z.infer<typeof updatePushTokenSchema>;

export interface UpdatePushTokenResponse {
  ok: true;
}

export interface AuthUser {
  id: string;
  phone: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string; // ISO 8601
  isNew: boolean; // true when this verification just created the account
}

/**
 * Web: tokens are omitted — the session lives in an HttpOnly cookie set by the server.
 * Native: `tokens` carries the Bearer accessToken + opaque refreshToken.
 */
export interface VerifyOtpResponse {
  ok: true;
  user: AuthUser;
  tokens?: AuthTokens;
}

export interface AuthTokens {
  accessToken: string;
  /** Seconds until accessToken expiry. */
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
  tokenType: "Bearer";
}

// ── Request: refresh (native only) ─────────────────────────────────────────────
export const refreshSchema = z.object({
  refreshToken: z.string().trim().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export interface RefreshResponse {
  ok: true;
  tokens: AuthTokens;
}

// ── Response: current user ──────────────────────────────────────────────────────
export interface MeResponse {
  ok: true;
  user: AuthUser;
}

// ── Account dashboard: devices & login history ──────────────────────────────────
/** A registered client install for the current user. */
export interface DeviceDTO {
  id: string;
  platform: Platform;
  deviceId: string;
  model: string | null;
  osVersion: string | null;
  appVersion: string | null;
  lastSeenAt: string; // ISO 8601
  createdAt: string; // ISO 8601
}

export interface DevicesResponse {
  ok: true;
  devices: DeviceDTO[];
}

/** A single OTP verification attempt in the audit trail. */
export interface LoginEventDTO {
  id: string;
  platform: Platform;
  ip: string | null;
  success: boolean;
  /** Failure reason (auth error code) for `success: false` events; `null` on success. */
  reason: string | null;
  createdAt: string; // ISO 8601
}

export interface LoginEventsResponse {
  ok: true;
  events: LoginEventDTO[];
}

// ── Endpoint paths (shared so SDKs never hard-code strings) ─────────────────────
export const AUTH_ROUTES = {
  requestOtp: "/auth/otp/request",
  verifyOtp: "/auth/otp/verify",
  refresh: "/auth/refresh",
  logout: "/auth/logout",
  me: "/auth/me",
  devices: "/auth/devices",
  pushToken: "/auth/devices/push-token",
  loginEvents: "/auth/login-events",
} as const;

// ── SDK interface draft (implemented per platform) ─────────────────────────────
/**
 * The shape every platform SDK implements. Transport differs:
 *  - web:     fetch with `credentials: "include"`; no token storage (cookie is HttpOnly).
 *  - ios:     URLSession + Keychain for tokens; `Authorization: Bearer <accessToken>`.
 *  - android: OkHttp/Retrofit + EncryptedSharedPreferences (or Keystore).
 *  - harmony: @ohos.net.http + @ohos.security.huks / Preferences for tokens.
 */
export interface AuthClient {
  requestOtp(input: RequestOtpInput): Promise<RequestOtpResponse>;
  verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResponse>;
  /** No-op on web (cookie handles it); native rotates the refresh token. */
  refresh(): Promise<AuthTokens | null>;
  me(): Promise<AuthUser>;
  /** Registered client installs for the current user (account dashboard). */
  listDevices(): Promise<DeviceDTO[]>;
  /** Recent OTP verification attempts for the current user (account dashboard). */
  listLoginEvents(): Promise<LoginEventDTO[]>;
  logout(): Promise<void>;
}
