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
