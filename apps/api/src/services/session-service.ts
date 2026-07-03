import { randomUUID } from "node:crypto";
import type { Auth } from "@infra/auth";
import { type Db, profile, refreshToken, user } from "@infra/db";
import type { AuthTokens } from "@infra/shared";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { SessionContext, SessionService, UserRecord } from "../routes/auth.routes.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from "./tokens.js";

export interface SessionServiceConfig {
  db: Db;
  /** Better Auth instance — its `getSession` resolves cookie + bearer for native flows. */
  auth: Auth;
  secret: string;
  cookie: { name: string; secure: boolean; domain?: string };
  ttl: {
    /** Web cookie lifetime (seconds). */
    webSeconds: number;
    /** Native access-token lifetime (seconds). */
    accessSeconds: number;
    /** Native refresh-token lifetime (seconds). */
    refreshSeconds: number;
  };
}

function serializeCookie(
  name: string,
  value: string,
  opts: { maxAge: number; secure: boolean; domain?: string },
): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${opts.maxAge}`,
  ];
  if (opts.secure) parts.push("Secure");
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  return parts.join("; ");
}

export function createSessionService(config: SessionServiceConfig): SessionService {
  const { db, auth, secret, cookie, ttl } = config;

  async function loadUser(userId: string): Promise<UserRecord | null> {
    const rows = await db
      .select({ user, profile })
      .from(user)
      .leftJoin(profile, eq(profile.userId, user.id))
      .where(eq(user.id, userId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.user.id,
      phone: row.user.phone ?? "",
      displayName: row.profile?.displayName ?? null,
      avatarUrl: row.profile?.avatarUrl ?? null,
      role: row.user.role,
      createdAt: row.user.createdAt,
    };
  }

  async function requireUser(headers: Headers): Promise<UserRecord | null> {
    // 1) Better Auth (handles its own cookie + bearer-plugin tokens).
    const session = await auth.api.getSession({ headers });
    if (session?.user?.id) {
      const fromDb = await loadUser(session.user.id);
      if (fromDb) return fromDb;
    }
    // 2) OTP-issued access token, via Bearer header or the web session cookie.
    const bearer = headers.get("authorization");
    const cookieHeader = headers.get("cookie");
    const token =
      (bearer?.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : null) ??
      readCookie(cookieHeader, cookie.name);
    if (!token) return null;
    const verified = verifyAccessToken(token, secret);
    if (!verified) return null;
    return loadUser(verified.userId);
  }

  async function issueTokens(user: UserRecord, ctx: SessionContext): Promise<AuthTokens> {
    const accessToken = signAccessToken(user.id, secret, ttl.accessSeconds);
    const { token: refresh, hash } = generateRefreshToken();
    await db.insert(refreshToken).values({
      id: randomUUID(),
      userId: user.id,
      deviceId: ctx.deviceId ?? null,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + ttl.refreshSeconds * 1000),
    });
    return {
      accessToken,
      accessTokenExpiresIn: ttl.accessSeconds,
      refreshToken: refresh,
      refreshTokenExpiresIn: ttl.refreshSeconds,
      tokenType: "Bearer",
    };
  }

  function webSessionCookies(userId: string): string[] {
    const token = signAccessToken(userId, secret, ttl.webSeconds);
    return [
      serializeCookie(cookie.name, token, {
        maxAge: ttl.webSeconds,
        secure: cookie.secure,
        domain: cookie.domain,
      }),
    ];
  }

  return {
    async issueWebSession(user) {
      return { cookies: webSessionCookies(user.id) };
    },

    async issueWebSessionForUser(userId) {
      // Re-load the user so a deleted/stale id can't mint a session, and so callers
      // (QR consume) get the fresh UserRecord to build the response DTO.
      const owner = await loadUser(userId);
      if (!owner) return null;
      return { user: owner, cookies: webSessionCookies(owner.id) };
    },

    issueTokens,

    async refresh(presented, ctx) {
      const hash = hashRefreshToken(presented);
      const rows = await db
        .select()
        .from(refreshToken)
        .where(
          and(
            eq(refreshToken.tokenHash, hash),
            isNull(refreshToken.revokedAt),
            gt(refreshToken.expiresAt, new Date()),
          ),
        )
        .limit(1);
      const current = rows[0];
      if (!current) return null;

      const owner = await loadUser(current.userId);
      if (!owner) return null;

      // Rotate: revoke the presented token and mint a fresh pair.
      const next = generateRefreshToken();
      const nextId = randomUUID();
      await db.transaction(async (tx) => {
        await tx
          .update(refreshToken)
          .set({ revokedAt: new Date(), replacedBy: nextId })
          .where(eq(refreshToken.id, current.id));
        await tx.insert(refreshToken).values({
          id: nextId,
          userId: current.userId,
          deviceId: current.deviceId,
          tokenHash: next.hash,
          expiresAt: new Date(Date.now() + ttl.refreshSeconds * 1000),
        });
      });

      void ctx;
      return {
        accessToken: signAccessToken(owner.id, secret, ttl.accessSeconds),
        accessTokenExpiresIn: ttl.accessSeconds,
        refreshToken: next.token,
        refreshTokenExpiresIn: ttl.refreshSeconds,
        tokenType: "Bearer",
      };
    },

    requireUser,

    async revoke(headers) {
      // Always tell cookie clients to drop the session cookie: it is HttpOnly, so
      // only an expired Set-Cookie (same attributes) from the server can clear it.
      const cookies = [
        serializeCookie(cookie.name, "", {
          maxAge: 0,
          secure: cookie.secure,
          domain: cookie.domain,
        }),
      ];
      // Sign-out-all: revoke every outstanding refresh token for the current user
      // so a leaked/rotating native token can no longer mint fresh access tokens.
      const current = await requireUser(headers);
      if (current) {
        await db
          .update(refreshToken)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshToken.userId, current.id), isNull(refreshToken.revokedAt)));
      }
      return { cookies };
    },
  };
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}
