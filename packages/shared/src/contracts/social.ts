import { z } from "zod";
import type { AuthTokens, AuthUser } from "./auth";
import { deviceInfoSchema, otpCodeSchema, phoneSchema, platformSchema } from "./auth";

/**
 * Social sign-in contracts (Google today; the list is an extension point for
 * Apple / GitHub / … later). Shared by the API and every client SDK — the single
 * source of truth for request/response shapes, routes and the provider list.
 *
 * Two transports, one identity outcome (see `docs/plans/google-login.md`):
 *  - **web / h5** ride a browser redirect: the browser hits {@link socialStartPath},
 *    the server 302s to the provider, the provider calls back, and the server
 *    bridges the result into the SAME `infra.session` cookie the OTP web flow issues
 *    — so a Google session is indistinguishable downstream from an OTP one.
 *  - **native (ios/android/harmony/cli)** obtain a provider ID token on-device and
 *    POST it to {@link socialTokenPath}; the response is byte-isomorphic to
 *    `verifyOtp` (`{ ok, user, tokens }`), so native clients reuse their existing
 *    token storage + refresh logic unchanged.
 *
 * `miniprogram` (`weapp`) is intentionally excluded — its `wx.*` container has no
 * system browser to carry an OAuth redirect. It exposes no social capability.
 */

// ── Providers (an `as const` tuple → the union, one extension point) ────────────
export const SOCIAL_PROVIDERS = ["google"] as const;
export const socialProviderSchema = z.enum(SOCIAL_PROVIDERS);
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

// ── Native: exchange a provider ID token for a session ──────────────────────────
// The client acquires the ID token via the platform's Google SDK, then POSTs it.
// `device` mirrors the OTP verify body so a native install registers its device row
// in the same shape. The provider itself is a path parameter, not a body field.
export const socialIdTokenSchema = z.object({
  /** The provider-issued OIDC ID token (a JWT). Verified server-side; never logged. */
  idToken: z.string().trim().min(1),
  /** Access token from the provider, when the SDK returns one (some flows require it). */
  accessToken: z.string().trim().min(1).optional(),
  /** Nonce the client bound into the ID token request, echoed for replay protection. */
  nonce: z.string().trim().min(1).max(256).optional(),
  platform: platformSchema,
  device: deviceInfoSchema.optional(),
});
export type SocialIdTokenInput = z.infer<typeof socialIdTokenSchema>;

/**
 * Native sign-in result — deliberately the same shape as `VerifyOtpResponse`:
 * `tokens` carries the Bearer accessToken + opaque refreshToken. Web never receives
 * this (it gets a 302 + Set-Cookie instead).
 */
export interface SocialAuthResponse {
  ok: true;
  user: AuthUser;
  tokens: AuthTokens;
}

// ── Web redirect: query for the start endpoint ──────────────────────────────────
// `redirect` is an app-relative path the browser lands on after the bridge issues
// its cookie (e.g. `/` or `/account`). Constrained to a same-origin path — a leading
// `/` but not `//` (which browsers treat as a protocol-relative absolute URL) — so a
// crafted `redirect` can't bounce the freshly-authenticated browser to another origin.
export const socialStartQuerySchema = z.object({
  redirect: z
    .string()
    .trim()
    .regex(/^\/(?!\/)[^\s]*$/, "redirect must be a same-origin path starting with a single /")
    .max(512)
    .optional(),
});
export type SocialStartQuery = z.infer<typeof socialStartQuerySchema>;

// ── Endpoint paths ──────────────────────────────────────────────────────────────
// Server registration patterns (Hono `:provider` param). Clients build a concrete
// path with the helpers below so they never hard-code the provider segment.
export const SOCIAL_ROUTE_PATTERNS = {
  /** web/h5: browser navigates here to begin the redirect flow. */
  startWebOAuth: "/auth/social/:provider/start",
  /** native: POST a provider ID token to sign in. */
  nativeIdToken: "/auth/social/:provider/token",
} as const;

/** Concrete `/auth/social/<provider>/start` path for a browser redirect. */
export function socialStartPath(provider: SocialProvider): string {
  return `/auth/social/${provider}/start`;
}

/** Concrete `/auth/social/<provider>/token` path for the native ID-token exchange. */
export function socialTokenPath(provider: SocialProvider): string {
  return `/auth/social/${provider}/token`;
}

/**
 * Full URL a browser client (web/h5) navigates to (full page) to begin the redirect
 * flow: `<apiBaseUrl>/auth/social/<provider>/start?redirect=<path>`. `apiBaseUrl` must
 * have no trailing slash (web's `env.ts` strips it). `redirect` is the same-origin app
 * path to land on after the callback bridges the session (defaults to the app root; the
 * server re-validates it against {@link socialStartQuerySchema}).
 */
export function socialStartUrl(
  apiBaseUrl: string,
  provider: SocialProvider,
  redirect = "/",
): string {
  return `${apiBaseUrl}${socialStartPath(provider)}?${new URLSearchParams({ redirect })}`;
}

// ── SDK interface draft (implemented per platform in a later phase) ─────────────
/**
 * Native clients (ios/android/harmony/cli) implement this alongside `AuthClient`.
 * Web uses the redirect (`socialStartPath`) and does NOT implement this method. A
 * `weapp` client implements nothing here (§1). Kept minimal on purpose — binding /
 * unlinking is a separate, later contract (see `docs/plans/google-login.md` §2.3).
 */
export interface SocialAuthClient {
  /** Verify a provider ID token acquired on-device and sign in (login == register). */
  signInWithIdToken(
    provider: SocialProvider,
    input: Omit<SocialIdTokenInput, "platform">,
  ): Promise<SocialAuthResponse>;
}

// ── Account linking (§2.3) — every endpoint requires an authenticated session ────
// Linking ADDS a second credential to the current account; it never merges two
// existing accounts. Conflicts (a target already owned by another account) are
// rejected. A `user` must always keep ≥1 way to sign in.

/** The current account's linked sign-in methods, for the "account security" screen. */
export interface IdentitiesResponse {
  ok: true;
  /** True when a phone credential is attached (a Google-only account has none). */
  phone: boolean;
  /** Social providers currently linked to this account. */
  providers: SocialProvider[];
}

// Link a phone to the current account: the caller first requests an OTP for `phone`
// (POST /auth/otp/request), then submits it here — verified like a login, but the code
// is attached to the CURRENT user instead of finding-or-creating one.
export const linkPhoneSchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
  platform: platformSchema,
});
export type LinkPhoneInput = z.infer<typeof linkPhoneSchema>;

/** Response to a successful phone link: the refreshed user (now carrying the phone). */
export interface LinkPhoneResponse {
  ok: true;
  user: AuthUser;
}

// Link a social provider on native, by verifying an on-device ID token and attaching
// the provider account to the CURRENT user (no new user, no new session).
export const linkSocialIdTokenSchema = z.object({
  idToken: z.string().trim().min(1),
  accessToken: z.string().trim().min(1).optional(),
  nonce: z.string().trim().min(1).max(256).optional(),
  platform: platformSchema,
});
export type LinkSocialIdTokenInput = z.infer<typeof linkSocialIdTokenSchema>;

export interface LinkSocialResponse {
  ok: true;
}

/** Unlink target: a social provider or the phone credential. */
export const UNLINK_TARGETS = [...SOCIAL_PROVIDERS, "phone"] as const;
export const unlinkTargetSchema = z.enum(UNLINK_TARGETS);
export type UnlinkTarget = (typeof UNLINK_TARGETS)[number];

export const unlinkSchema = z.object({
  target: unlinkTargetSchema,
  platform: platformSchema,
});
export type UnlinkInput = z.infer<typeof unlinkSchema>;

export interface UnlinkResponse {
  ok: true;
}

// ── Linking route paths ─────────────────────────────────────────────────────────
export const SOCIAL_LINK_ROUTE_PATTERNS = {
  identities: "/auth/identities",
  linkPhone: "/auth/link/phone",
  /** web/h5 redirect link (starts an OAuth link for the logged-in user). */
  linkSocialStart: "/auth/link/social/:provider/start",
  /** native link (verify an on-device ID token, attach to the logged-in user). */
  linkSocialToken: "/auth/link/social/:provider/token",
  unlink: "/auth/unlink",
} as const;

/** Concrete `/auth/link/social/<provider>/start` path (web redirect link). */
export function socialLinkStartPath(provider: SocialProvider): string {
  return `/auth/link/social/${provider}/start`;
}

/** Concrete `/auth/link/social/<provider>/token` path (native ID-token link). */
export function socialLinkTokenPath(provider: SocialProvider): string {
  return `/auth/link/social/${provider}/token`;
}

/** Full URL a browser client navigates to (full page) to begin a redirect LINK. */
export function socialLinkStartUrl(
  apiBaseUrl: string,
  provider: SocialProvider,
  redirect = "/",
): string {
  return `${apiBaseUrl}${socialLinkStartPath(provider)}?${new URLSearchParams({ redirect })}`;
}

/**
 * Account-management client (identities / link phone / unlink / native social link),
 * separate from {@link SocialAuthClient} and `AuthClient` — like `QrLoginClient`, it is
 * a distinct capability a client opts into. web/h5 link Google via the redirect
 * ({@link socialLinkStartUrl}), so they do NOT implement `linkSocialWithIdToken`.
 */
export interface AccountLinkClient {
  identities(): Promise<IdentitiesResponse>;
  /** `platform` is injected by the platform-bound client; callers pass phone + code. */
  linkPhone(input: Omit<LinkPhoneInput, "platform">): Promise<AuthUser>;
  unlink(target: UnlinkTarget): Promise<void>;
  /** Native only: attach a provider account via an on-device ID token. */
  linkSocialWithIdToken(
    provider: SocialProvider,
    input: Omit<LinkSocialIdTokenInput, "platform">,
  ): Promise<void>;
}
