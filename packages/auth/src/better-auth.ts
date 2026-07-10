import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
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
   * Web-redirect session bridge. Called after a social OAuth **callback** completes and
   * Better Auth has minted its own session, with the signed-in user (id + the provider
   * name/avatar hints Better Auth stored). Returns the `Set-Cookie` value for OUR
   * `infra.session`; the callback response then carries only our cookie (Better Auth's
   * own session cookies are stripped), so a Google web session is authored by our
   * `SessionService` and is identical downstream to an OTP one — including logout, which
   * clears `infra.session`. The callback also gets to run async side effects
   * (provision the `profile` row from the hints, audit a `login_event`) — symmetric with
   * the native ID-token route. Omitted ⇒ no bridge (native reads the returned user
   * directly). Injected by the API composition (server.ts), so this package stays free
   * of the session layer.
   */
  onOAuthCallbackSession?: (info: OAuthCallbackUser) => string | null | Promise<string | null>;
}

/** The signed-in user handed to the web-redirect bridge callback. */
export interface OAuthCallbackUser {
  userId: string;
  /** Provider display name (Google `name`), for first-time profile provisioning. */
  name: string | null;
  /** Provider avatar (Google `picture`), for first-time profile provisioning. */
  image: string | null;
}

// Better Auth's own session-related cookies (names carry the cookiePrefix + any
// `__Secure-` prefix). We strip these from the OAuth-callback response so only our
// `infra.session` survives — see `onOAuthCallbackSession`.
interface AuthCookieDef {
  name: string;
}
interface AuthCookies {
  sessionToken: AuthCookieDef;
  sessionData: AuthCookieDef;
  dontRememberToken: AuthCookieDef;
  accountData?: AuthCookieDef;
}

/** Minimal structural view of the Better Auth after-hook context this bridge reads. */
export interface OAuthCallbackCtx {
  path?: string;
  params?: Record<string, string | undefined>;
  context: {
    newSession?: {
      user?: { id?: string; name?: string | null; image?: string | null };
    } | null;
    responseHeaders?: Headers;
    authCookies?: AuthCookies;
  };
}

function collectBaCookieNames(cookies: AuthCookies | undefined): string[] {
  if (!cookies) return [];
  return [
    cookies.sessionToken?.name,
    cookies.sessionData?.name,
    cookies.dontRememberToken?.name,
    cookies.accountData?.name,
  ].filter((n): n is string => typeof n === "string");
}

function readSetCookies(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetter.getSetCookie === "function") return withGetter.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

/**
 * The web-redirect session bridge, as a pure function of the after-hook context so it
 * can be unit-tested without a live OAuth round-trip.
 *
 * Fires only on a social OAuth **callback** (`/callback/:id`) that just minted a
 * session — NOT on `auth.api.signInSocial` (path `/sign-in/social`, the native
 * ID-token flow, which also runs `after`), nor on the callback's error/redirect hops
 * (no `newSession`). On a match it strips Better Auth's own session `Set-Cookie`(s)
 * from the response and appends ONLY our `infra.session` cookie (from `mint`), leaving
 * the 302 `Location` untouched — so the browser lands authenticated by our session
 * alone, and logout (which clears `infra.session`) stays authoritative.
 */
export async function bridgeOAuthCallbackSession(
  ctx: OAuthCallbackCtx,
  mint: (info: OAuthCallbackUser) => string | null | Promise<string | null>,
): Promise<void> {
  if (ctx.path !== "/callback/:id" || !ctx.params?.id) return;
  const user = ctx.context.newSession?.user;
  if (!user?.id) return;
  const headers = ctx.context.responseHeaders;
  if (!headers) return;
  const cookie = await mint({
    userId: user.id,
    name: user.name ?? null,
    image: user.image ?? null,
  });
  if (!cookie) return;

  const baNames = collectBaCookieNames(ctx.context.authCookies);
  const survivors = readSetCookies(headers).filter(
    (entry) => !baNames.some((n) => entry.startsWith(`${n}=`) || entry.startsWith(`${n}.`)),
  );
  headers.delete("set-cookie");
  for (const s of survivors) headers.append("set-cookie", s);
  headers.append("set-cookie", cookie);
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
  const onOAuthCallbackSession = options.onOAuthCallbackSession;
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
    // Registered only when Google is configured. Sign-in itself stays driven by our
    // own layers: the native ID-token flow calls `auth.api.signInSocial` to verify
    // the token + find-or-create, then discards Better Auth's session and mints our
    // own via `SessionService` (see routes/social.routes.ts). Better Auth is the
    // identity store, not the session authority — same posture as the OTP flow.
    ...(options.google
      ? {
          socialProviders: {
            google: {
              clientId: options.google.clientId,
              clientSecret: options.google.clientSecret,
            },
          },
        }
      : {}),
    // Web-redirect bridge: on the Google OAuth callback, swap Better Auth's session
    // cookie for our own `infra.session` (see `bridgeOAuthCallbackSession`). Registered
    // only when the API composition supplies the minting callback.
    ...(onOAuthCallbackSession
      ? {
          hooks: {
            after: createAuthMiddleware(async (ctx) => {
              await bridgeOAuthCallbackSession(
                ctx as unknown as OAuthCallbackCtx,
                onOAuthCallbackSession,
              );
            }),
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
