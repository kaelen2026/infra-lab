import { z } from "zod";
// Avatars reuse the app's image-upload rules (accepted content types + size cap),
// which live with the timeline contract — the single source of truth for "an
// uploaded image". Importing the type here keeps avatar callers from reaching
// into the timeline domain directly.
import type { TimelineImageContentType } from "./timeline";

/**
 * Auth contracts shared by the API and all four client SDKs (web / ios / android / harmony).
 * This is the single source of truth for request/response shapes, error codes and limits.
 */

// ── Platforms ────────────────────────────────────────────────────────────────
// `cli` is the terminal client (apps/cli). It has no cookie jar, so — like the
// native platforms — it authenticates with Bearer + refresh tokens, persisting
// them in a local credentials file. Adding it is additive: native clients only
// ever send their own value and never decode this enum, so they are unaffected.
// `weapp` is the WeChat mini-program (apps/miniprogram): also cookie-less, so it
// rides the same Bearer + refresh channel as `cli`, storing tokens in wx storage.
export const PLATFORMS = ["web", "ios", "android", "harmony", "cli", "weapp"] as const;
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

// ── Email address (alternative OTP subject) ─────────────────────────────────────
// Trimmed + lowercased before validation so lookup/storage is case-insensitive
// (a user typing `Foo@Bar.com` maps to the same account as `foo@bar.com`). Capped
// at the RFC 5321 practical maximum. Delivery is via Resend (see the API's
// resend-client); the same OTP service backs both phone and email codes.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email("must be a valid email address");

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
  "QR_NOT_FOUND", // scan/approve/consume against an unknown or expired login ticket
  "QR_ALREADY_USED", // the ticket was already approved (or consumed) — can't reuse it
  "QR_NOT_APPROVED", // consume attempted before a native client approved the ticket
  // Social sign-in (Google). See contracts/social.ts and docs/plans/google-login.md.
  "SOCIAL_PROVIDER_DISABLED", // provider not configured on the server (no clientId/secret)
  "SOCIAL_TOKEN_INVALID", // the presented OAuth id token failed verification
  "SOCIAL_ACCOUNT_ERROR", // provider verified but the account could not be established
  // Account linking (§2.3). Conflicts are rejected, never auto-merged.
  "SOCIAL_ALREADY_LINKED", // the social account is already linked (to this or another user)
  "PHONE_ALREADY_LINKED", // the phone already belongs to another account
  "LAST_CREDENTIAL", // unlinking would leave the account with no way to sign in
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

// ── Request: send email OTP ─────────────────────────────────────────────────────
// The email counterpart of {@link requestOtpSchema}. Same limits, TTL and response
// shape as the phone flow — only the subject (and delivery channel) differ. The
// response reuses {@link RequestOtpResponse}.
export const requestEmailOtpSchema = z.object({
  email: emailSchema,
  platform: platformSchema,
});
export type RequestEmailOtpInput = z.infer<typeof requestEmailOtpSchema>;

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

// ── Request: verify email OTP (login == register) ───────────────────────────────
// The email counterpart of {@link verifyOtpSchema}. On success the server
// finds-or-creates the account by email and issues a session; the response reuses
// {@link VerifyOtpResponse}.
export const verifyEmailOtpSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
  platform: platformSchema,
  device: deviceInfoSchema.optional(),
});
export type VerifyEmailOtpInput = z.infer<typeof verifyEmailOtpSchema>;

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
  /**
   * `null` for accounts with no phone credential — a user who signed in with a
   * social provider (Google) and never linked a phone. Cross-client contract:
   * every decoder (TS SDK + native mirrors) must tolerate a null and fall back to
   * `displayName` for presentation. See `docs/plans/google-login.md`.
   */
  phone: string | null;
  /**
   * `null` for accounts with no email credential — a phone-OTP or social account
   * that never signed in with an email. Populated for accounts created via the
   * email-OTP flow. Additive to the contract: every decoder (TS SDK + native
   * mirrors) must tolerate its absence/null.
   */
  email: string | null;
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

// ── Request: update the current user's profile ──────────────────────────────────
// Editing (display name + avatar) for the account screen. Both fields are optional
// (a partial update): an omitted key leaves the field unchanged, an explicit `null`
// clears it. The avatar image is normally set via the dedicated upload endpoint
// (`AUTH_ROUTES.avatar`, which persists the file and returns the refreshed user);
// this JSON path is for renaming and for clearing either field.
/** Max length of a user-chosen display name. */
export const DISPLAY_NAME_MAX_LENGTH = 50;

/** A `/uploads/<name>` reference the server issued (same shape as timeline images). */
const uploadedImageUrlSchema = z
  .string()
  .trim()
  .regex(/^\/uploads\/[A-Za-z0-9_-]+\.[a-z0-9]+$/, "must be an uploaded image url");

export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH).nullable().optional(),
    avatarUrl: uploadedImageUrlSchema.nullable().optional(),
  })
  .strict();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Response to a profile update or an avatar upload: the refreshed user. */
export interface ProfileResponse {
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

// ── CLI browser-assisted login (OAuth Device Authorization Grant, gh-style) ──────
// The terminal client (`apps/cli`) can't read the browser's cookie jar, so — like
// GitHub CLI — it uses the device flow: it requests a `deviceCode` (secret, kept by
// the CLI) + a short `userCode` (shown to the user), opens the browser to
// `verificationUri` where the already-logged-in user approves, and meanwhile polls
// the token endpoint until it receives its own Bearer + refresh tokens. The token
// never passes through the browser. See `docs/plans/cli-plan.md`.
export const cliDeviceCodeRequestSchema = z.object({
  /** Stable per-install id (becomes the `device` row's deviceId). */
  deviceId: z.string().trim().min(1).max(128),
  model: z.string().trim().max(128).optional(),
  osVersion: z.string().trim().max(64).optional(),
  appVersion: z.string().trim().max(64).optional(),
});
export type CliDeviceCodeRequest = z.infer<typeof cliDeviceCodeRequestSchema>;

export interface CliDeviceCodeResponse {
  ok: true;
  /** Secret the CLI keeps and polls with; never shown to the user. */
  deviceCode: string;
  /** Short human code the user confirms in the browser (e.g. `WDJB-MJHT`). */
  userCode: string;
  /** Page the CLI opens for approval; append `?user_code=<userCode>` to prefill. */
  verificationUri: string;
  /** Seconds until the codes expire. */
  expiresIn: number;
  /** Minimum seconds the CLI must wait between token polls. */
  interval: number;
}

export const cliDeviceTokenRequestSchema = z.object({
  deviceCode: z.string().trim().min(1),
});
export type CliDeviceTokenRequest = z.infer<typeof cliDeviceTokenRequestSchema>;

/**
 * Non-success poll states: keep polling (`authorization_pending`), back off
 * (`slow_down`), or stop (`expired_token` / `access_denied`). Mirrors RFC 8628.
 */
export const CLI_DEVICE_PENDING_STATUSES = [
  "authorization_pending",
  "slow_down",
  "expired_token",
  "access_denied",
] as const;
export type CliDevicePendingStatus = (typeof CLI_DEVICE_PENDING_STATUSES)[number];

/**
 * Token-poll result. Returned with HTTP 200 in every case — a pending state is a
 * normal step of the flow, not an error — so the CLI branches on the discriminant
 * rather than catching per-poll. `ok: true` yields the tokens exactly once.
 */
export type CliDeviceTokenResponse =
  | { ok: true; user: AuthUser; tokens: AuthTokens }
  | { ok: false; status: CliDevicePendingStatus };

export const cliDeviceApproveSchema = z.object({
  userCode: z.string().trim().min(1).max(32),
  /** Set true to deny the request instead of approving it. */
  deny: z.boolean().optional(),
});
export type CliDeviceApproveInput = z.infer<typeof cliDeviceApproveSchema>;

export interface CliDeviceApproveResponse {
  ok: true;
  /** Outcome for the browser UI: matched-and-approved / -denied, or no live code. */
  result: "approved" | "denied" | "not_found";
}

/** Web page path where the browser approves a CLI device-flow request. */
export const CLI_VERIFICATION_PATH = "/auth/cli";

// ── QR cross-device login (an authenticated native client approves a web sign-in) ─
// Flow: the browser calls `create` and renders `ticketId` as a QR code, while keeping
// the secret `pollToken` to itself. A logged-in native app scans the QR and calls
// `approve` (with its own Bearer/cookie) to bind its user to the ticket. The browser
// polls `status` (proving ownership with `pollToken`); once `approved`, it calls
// `consume` to exchange the ticket for its own HttpOnly session cookie. The ticket is
// single-use and short-lived — see {@link QR_LOGIN_LIMITS}.
export const QR_LOGIN_LIMITS = {
  /** Lifetime of a freshly created ticket, before any scan. */
  ttlSeconds: 120,
  /** Lifetime granted after approval, giving the browser time to consume it. */
  approvalWindowSeconds: 120,
} as const;

/**
 * Ticket lifecycle as seen by the polling browser:
 *  - `pending`  — created, not yet approved by a native client.
 *  - `approved` — a native client bound its user; ready for the browser to consume.
 *  - `expired`  — TTL elapsed or the ticket was consumed (single-use); browser restarts.
 */
export const QR_LOGIN_STATUSES = ["pending", "approved", "expired"] as const;
export type QrLoginStatus = (typeof QR_LOGIN_STATUSES)[number];

/** Response to `create`: the public `ticketId` (goes in the QR) + secret `pollToken`. */
export interface CreateQrLoginResponse {
  ok: true;
  /** Public ticket id — encode this in the QR code for the native app to scan. */
  ticketId: string;
  /** Secret held only by the creating browser; required to poll status and consume. */
  pollToken: string;
  /** Seconds until the (un-approved) ticket expires. */
  expiresIn: number;
}

/**
 * Header carrying the secret `pollToken` on the status poll. A capability token in
 * a GET query string gets recorded by upstream proxies / browser history / Referer;
 * a header does not. The server still accepts the legacy `pollToken` query
 * parameter for one deploy cycle (an already-open web tab polls with the old
 * bundle until refreshed) — new clients must send the header.
 */
export const QR_POLL_TOKEN_HEADER = "x-qr-poll-token";

/** Browser status poll — carries the secret `pollToken` so only the creator can read it. */
export const qrLoginStatusQuerySchema = z.object({
  ticketId: z.string().trim().min(1).max(128),
  /** Sent via {@link QR_POLL_TOKEN_HEADER}; query form is deprecated (leaks into proxy logs). */
  pollToken: z.string().trim().min(1).max(256),
});
export type QrLoginStatusQuery = z.infer<typeof qrLoginStatusQuerySchema>;

export interface QrLoginStatusResponse {
  ok: true;
  status: QrLoginStatus;
}

/** Native approve — the scanning app sends only the public ticket id; its own session authenticates it. */
export const approveQrLoginSchema = z.object({
  ticketId: z.string().trim().min(1).max(128),
});
export type ApproveQrLoginInput = z.infer<typeof approveQrLoginSchema>;

export interface ApproveQrLoginResponse {
  ok: true;
}

/** Browser consume — exchanges an approved ticket for a web session cookie. */
export const consumeQrLoginSchema = z.object({
  ticketId: z.string().trim().min(1).max(128),
  pollToken: z.string().trim().min(1).max(256),
});
export type ConsumeQrLoginInput = z.infer<typeof consumeQrLoginSchema>;

export interface ConsumeQrLoginResponse {
  ok: true;
  user: AuthUser;
}

// ── Endpoint paths (shared so SDKs never hard-code strings) ─────────────────────
export const AUTH_ROUTES = {
  requestOtp: "/auth/otp/request",
  verifyOtp: "/auth/otp/verify",
  requestEmailOtp: "/auth/otp/email/request",
  verifyEmailOtp: "/auth/otp/email/verify",
  refresh: "/auth/refresh",
  logout: "/auth/logout",
  me: "/auth/me",
  updateProfile: "/auth/profile",
  avatar: "/auth/avatar",
  devices: "/auth/devices",
  pushToken: "/auth/devices/push-token",
  loginEvents: "/auth/login-events",
  cliDevice: "/auth/cli/device",
  cliDeviceToken: "/auth/cli/device/token",
  cliDeviceApprove: "/auth/cli/device/approve",
  qrCreate: "/auth/qr/create",
  qrStatus: "/auth/qr/status",
  qrApprove: "/auth/qr/approve",
  qrConsume: "/auth/qr/consume",
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
  /** Update the current user's display name / avatar; returns the refreshed user. */
  updateProfile(input: UpdateProfileInput): Promise<AuthUser>;
  /**
   * Upload a new avatar image (multipart); the server persists it, sets it on the
   * profile and returns the refreshed user. `contentType` must be one the upload
   * endpoint accepts (see {@link TimelineImageContentType}).
   */
  uploadAvatar(bytes: Uint8Array, contentType: TimelineImageContentType): Promise<AuthUser>;
  /** Registered client installs for the current user (account dashboard). */
  listDevices(): Promise<DeviceDTO[]>;
  /** Recent OTP verification attempts for the current user (account dashboard). */
  listLoginEvents(): Promise<LoginEventDTO[]>;
  logout(): Promise<void>;
}

/**
 * QR cross-device login. Transport is the same fetch/URLSession model as
 * {@link AuthClient}; the calls split by who makes them:
 *  - browser (unauthenticated → authenticated): `create` → poll `status` → `consume`.
 *  - native (already authenticated): `approve` — carries the caller's Cookie/Bearer.
 */
export interface QrLoginClient {
  /** Browser: start a login ticket to render as a QR code. */
  create(): Promise<CreateQrLoginResponse>;
  /** Browser: poll a ticket's status (needs the secret pollToken from `create`). */
  status(input: QrLoginStatusQuery): Promise<QrLoginStatus>;
  /** Native: approve a scanned ticket, binding the caller's user to it. */
  approve(input: ApproveQrLoginInput): Promise<void>;
  /** Browser: exchange an approved ticket for this browser's session cookie. */
  consume(input: ConsumeQrLoginInput): Promise<AuthUser>;
}
