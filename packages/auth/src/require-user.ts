/**
 * Transport-agnostic session resolution. Works for both auth styles:
 *  - Web  → HttpOnly `Cookie` header (Better Auth session cookie).
 *  - Native → `Authorization: Bearer <accessToken>` header.
 *
 * Better Auth's `bearer()` plugin already normalizes a Bearer token into the
 * session cookie internally, so a single `getSession({ headers })` call resolves
 * both — we just need to forward the original request headers.
 */

export interface SessionUser {
  id: string;
  phone?: string | null;
  [key: string]: unknown;
}

export interface SessionResolver {
  getSession(args: { headers: Headers }): Promise<{ user: SessionUser } | null>;
}

export class UnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED" as const;
  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

const BEARER_PREFIX = "bearer ";

/** Pull a Bearer access token out of the Authorization header (case-insensitive scheme). */
export function extractBearerToken(headers: Headers): string | null {
  const header = headers.get("authorization");
  if (!header) return null;
  if (!header.toLowerCase().startsWith(BEARER_PREFIX)) return null;
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

/** Read a named cookie value out of the Cookie header. */
export function extractCookie(headers: Headers, name: string): string | null {
  const header = headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/** True when the request carries *some* credential (cookie or bearer). */
export function hasCredential(headers: Headers, cookieName: string): boolean {
  return extractBearerToken(headers) !== null || extractCookie(headers, cookieName) !== null;
}

/**
 * Build a `requireUser(headers)` guard. Resolves the session via the supplied
 * resolver (typically `auth.api`) and throws {@link UnauthorizedError} when absent.
 */
export function createRequireUser(resolver: SessionResolver) {
  return async function requireUser(headers: Headers): Promise<SessionUser> {
    const session = await resolver.getSession({ headers });
    if (!session?.user) throw new UnauthorizedError();
    return session.user;
  };
}

/** Non-throwing variant — returns null instead of throwing. */
export function createGetUser(resolver: SessionResolver) {
  return async function getUser(headers: Headers): Promise<SessionUser | null> {
    const session = await resolver.getSession({ headers });
    return session?.user ?? null;
  };
}
