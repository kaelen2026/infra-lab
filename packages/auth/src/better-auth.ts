import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";

export interface CreateAuthOptions {
  /** A Drizzle db instance (node-postgres / postgres-js). */
  db: Parameters<typeof drizzleAdapter>[0];
  /** Drizzle schema object so the adapter can find user/session/account/verification tables. */
  schema?: Record<string, unknown>;
  secret: string;
  baseURL: string;
  trustedOrigins?: string[];
  cookie?: {
    domain?: string;
    secure?: boolean;
  };
  /**
   * Google sign-in. Injected only when configured (see `googleConfigFromEnv`); when
   * omitted no social provider is registered and the social routes answer
   * SOCIAL_PROVIDER_DISABLED. `clientId` accepts an array so the native ID-token flow
   * can accept tokens minted for several audiences (web + iOS + Android client ids);
   * the web redirect flow uses the first entry. `clientSecret` is required for the
   * (later) web authorization-code flow; the native ID-token flow verifies against
   * the audience alone. Never logged.
   */
  google?: {
    clientId: string | string[];
    clientSecret: string;
  };
  /**
   * Apple sign-in. Injected only when configured (see `appleConfigFromEnv`). Native-
   * only for now: the on-device Sign in with Apple idToken carries the app bundle id
   * in its `aud`, so `clientId` is the bundle id and we also pass it as
   * `appBundleIdentifier` (Better Auth verifies the native token's audience against
   * it). No `clientSecret` — that is only needed for the (later) web authorization-
   * code flow, and the native ID-token flow verifies against the audience alone.
   */
  apple?: {
    clientId: string;
    appBundleIdentifier: string;
  };
}

/**
 * Better Auth instance for phone-OTP sessions.
 *
 * - `bearer()` lets native clients send `Authorization: Bearer <token>`; the plugin
 *   maps it onto the session cookie internally, so `auth.api.getSession({ headers })`
 *   resolves both web (cookie) and native (bearer) requests — that is what backs
 *   `requireUser`.
 * - Web cookies are HttpOnly + SameSite=Lax by default; we set `secure` from config.
 *
 * Sign-in itself is driven by our own Redis OTP flow (see {@link import("./otp.js")}).
 * After a code is verified we mint a session through `auth.$context.internalAdapter`.
 */
export function createAuth(options: CreateAuthOptions) {
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: options.trustedOrigins,
    database: drizzleAdapter(options.db, {
      provider: "pg",
      ...(options.schema ? { schema: options.schema } : {}),
    }),
    session: {
      // accessToken (native) / cookie (web) lifetime
      expiresIn: 60 * 60 * 24 * 30, // 30 days session record
      updateAge: 60 * 60 * 24, // refresh the session record at most once a day
    },
    // Registered only for the providers configured (Google and/or Apple). Sign-in
    // itself stays driven by our own layers: the native ID-token flow calls
    // `auth.api.signInSocial` to verify the token + find-or-create, then discards
    // Better Auth's session and mints our own via `SessionService` (see
    // routes/social.routes.ts). Better Auth is the identity store, not the session
    // authority — same posture as the OTP flow.
    ...(options.google || options.apple
      ? {
          socialProviders: {
            ...(options.google
              ? {
                  google: {
                    clientId: options.google.clientId,
                    clientSecret: options.google.clientSecret,
                  },
                }
              : {}),
            ...(options.apple
              ? {
                  apple: {
                    clientId: options.apple.clientId,
                    // Native idToken `aud` is the bundle id, not a Services ID.
                    appBundleIdentifier: options.apple.appBundleIdentifier,
                  },
                }
              : {}),
          },
        }
      : {}),
    advanced: {
      cookiePrefix: "infra",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: options.cookie?.secure ?? false,
        ...(options.cookie?.domain ? { domain: options.cookie.domain } : {}),
      },
    },
    plugins: [bearer()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
