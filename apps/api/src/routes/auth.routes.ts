import type { OtpService } from "@infra/auth";
import {
  type AuthErrorCode,
  type AuthTokens,
  type AuthUser,
  type DeviceDTO,
  type DeviceInfo,
  isCookiePlatform,
  type LoginEventDTO,
  type Platform,
  refreshSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from "@infra/shared";
import { type Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// ── Ports the routes depend on (implemented in src/services with db + better-auth) ──
export interface UserRecord {
  id: string;
  phone: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface UserRepository {
  findByPhone(phone: string): Promise<UserRecord | null>;
  /** Creates the user row AND its profile row in one transaction. */
  createWithProfile(phone: string): Promise<UserRecord>;
  recordDevice(userId: string, device: DeviceInfo): Promise<void>;
  recordLoginEvent(event: {
    userId: string;
    phone: string;
    platform: Platform;
    ip: string;
    deviceId?: string;
    success: boolean;
  }): Promise<void>;
  /** Registered devices for the account dashboard, most-recently-seen first. */
  listDevices(userId: string): Promise<DeviceDTO[]>;
  /** Recent login attempts for the account dashboard, newest first. */
  listLoginEvents(userId: string, limit?: number): Promise<LoginEventDTO[]>;
}

export interface SessionContext {
  ip: string;
  headers: Headers;
  platform: Platform;
  deviceId?: string;
}

export interface SessionService {
  /** Web: returns Set-Cookie values to attach (HttpOnly session cookie). */
  issueWebSession(user: UserRecord, ctx: SessionContext): Promise<{ cookies: string[] }>;
  /** Native: returns Bearer accessToken + opaque refreshToken. */
  issueTokens(user: UserRecord, ctx: SessionContext): Promise<AuthTokens>;
  /** Rotate a refresh token, or null if it is unknown/expired/revoked. */
  refresh(refreshToken: string, ctx: Pick<SessionContext, "ip">): Promise<AuthTokens | null>;
  /** Resolve the current user from Cookie or Bearer (null when unauthenticated). */
  requireUser(headers: Headers): Promise<UserRecord | null>;
  revoke(headers: Headers): Promise<void>;
}

export interface AuthRouteDeps {
  otp: OtpService;
  users: UserRepository;
  sessions: SessionService;
  /** Deliver the code via your SMS provider. The code is never persisted in plaintext. */
  sms: (phone: string, code: string) => Promise<void>;
  config: { debugReturnCode: boolean };
}

const ERROR_STATUS: Record<AuthErrorCode, ContentfulStatusCode> = {
  INVALID_REQUEST: 400,
  RESEND_COOLDOWN: 429,
  DAILY_LIMIT_EXCEEDED: 429,
  IP_LIMIT_EXCEEDED: 429,
  LOCKED: 423,
  CODE_EXPIRED: 401,
  INVALID_CODE: 401,
  UNAUTHORIZED: 401,
  INVALID_REFRESH_TOKEN: 401,
};

function clientIp(headers: Headers): string {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (first) return first;
  return headers.get("x-real-ip") ?? "0.0.0.0";
}

function toAuthUser(user: UserRecord, isNew: boolean): AuthUser {
  return {
    id: user.id,
    phone: user.phone,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
    isNew,
  };
}

export function createAuthRoutes(deps: AuthRouteDeps): Hono {
  const { otp, users, sessions, sms, config } = deps;
  const app = new Hono();

  const fail = (c: Context, code: AuthErrorCode, extra: Record<string, unknown> = {}) =>
    c.json({ ok: false, code, ...extra }, ERROR_STATUS[code]);

  async function readJson(c: Context): Promise<unknown> {
    try {
      return await c.req.json();
    } catch {
      return undefined;
    }
  }

  // ── Send a code ────────────────────────────────────────────────────────────
  app.post("/auth/otp/request", async (c) => {
    const parsed = requestOtpSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, "INVALID_REQUEST", { issues: parsed.error.issues });

    const { phone } = parsed.data;
    const ip = clientIp(c.req.raw.headers);
    const res = await otp.requestCode({ phone, ip });
    if (!res.ok) return fail(c, res.error, { retryAfter: res.retryAfter });

    await sms(phone, res.code);
    return c.json({
      ok: true,
      ttlSeconds: res.ttlSeconds,
      resendAfterSeconds: res.resendAfterSeconds,
      ...(config.debugReturnCode ? { debugCode: res.code } : {}),
    });
  });

  // ── Verify a code (login == register) ────────────────────────────────────────
  app.post("/auth/otp/verify", async (c) => {
    const parsed = verifyOtpSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, "INVALID_REQUEST", { issues: parsed.error.issues });

    const { phone, code, platform, device } = parsed.data;
    const ip = clientIp(c.req.raw.headers);

    const result = await otp.verifyCode({ phone, code });
    if (!result.ok) {
      const extra =
        result.error === "INVALID_CODE"
          ? { remainingAttempts: result.remainingAttempts }
          : result.error === "LOCKED"
            ? { retryAfter: result.retryAfter }
            : {};
      return fail(c, result.error, extra);
    }

    // Find-or-create: a brand-new phone gets a user + profile automatically.
    let user = await users.findByPhone(phone);
    const isNew = user === null;
    if (!user) user = await users.createWithProfile(phone);

    if (device) await users.recordDevice(user.id, device);
    await users.recordLoginEvent({
      userId: user.id,
      phone,
      platform,
      ip,
      deviceId: device?.deviceId,
      success: true,
    });

    const ctx: SessionContext = {
      ip,
      headers: c.req.raw.headers,
      platform,
      deviceId: device?.deviceId,
    };

    if (isCookiePlatform(platform)) {
      const { cookies } = await sessions.issueWebSession(user, ctx);
      for (const cookie of cookies) c.header("set-cookie", cookie, { append: true });
      return c.json({ ok: true, user: toAuthUser(user, isNew) });
    }

    const tokens = await sessions.issueTokens(user, ctx);
    return c.json({ ok: true, user: toAuthUser(user, isNew), tokens });
  });

  // ── Rotate refresh token (native only) ───────────────────────────────────────
  app.post("/auth/refresh", async (c) => {
    const parsed = refreshSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, "INVALID_REQUEST", { issues: parsed.error.issues });

    const ip = clientIp(c.req.raw.headers);
    const tokens = await sessions.refresh(parsed.data.refreshToken, { ip });
    if (!tokens) return fail(c, "INVALID_REFRESH_TOKEN");
    return c.json({ ok: true, tokens });
  });

  // ── Logout ────────────────────────────────────────────────────────────────────
  app.post("/auth/logout", async (c) => {
    await sessions.revoke(c.req.raw.headers);
    return c.json({ ok: true });
  });

  // ── Current user (Cookie or Bearer) ──────────────────────────────────────────
  app.get("/auth/me", async (c) => {
    const user = await sessions.requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");
    return c.json({ ok: true, user: toAuthUser(user, false) });
  });

  // ── Account dashboard: this user's devices ───────────────────────────────────
  app.get("/auth/devices", async (c) => {
    const user = await sessions.requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");
    return c.json({ ok: true, devices: await users.listDevices(user.id) });
  });

  // ── Account dashboard: this user's recent login attempts ─────────────────────
  app.get("/auth/login-events", async (c) => {
    const user = await sessions.requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");
    return c.json({ ok: true, events: await users.listLoginEvents(user.id) });
  });

  return app;
}
