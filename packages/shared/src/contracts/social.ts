import { z } from "zod";
import type { AuthTokens, AuthUser } from "./auth";
import { deviceInfoSchema, platformSchema } from "./auth";

/**
 * Social sign-in contracts (Google + Apple today; the list is an extension point
 * for GitHub / … later). Shared by the API and every client SDK — the single
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
// `apple` ships native-only for now (iOS `AuthenticationServices` → ID-token flow);
// its web redirect + Services-ID/`.p8` client-secret path is deferred like Google's.
export const SOCIAL_PROVIDERS = ["google", "apple"] as const;
export const socialProviderSchema = z.enum(SOCIAL_PROVIDERS);
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

// ── Native: exchange a provider ID token for a session ──────────────────────────
// The client acquires the ID token via the platform's provider SDK (Google Sign-In,
// Apple `AuthenticationServices`, …), then POSTs it.
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
