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
  updatePushTokenSchema,
  verifyOtpSchema,
} from "@infra/shared";
import { type Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ObsEnv } from "../observability/middleware.js";

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
    /** `null` for failed attempts on a phone with no existing account. */
    userId: string | null;
    phone: string;
    platform: Platform;
    ip: string;
    deviceId?: string;
    success: boolean;
    /** Auth error code for failed attempts (INVALID_CODE / LOCKED / CODE_EXPIRED). */
    reason?: string;
  }): Promise<void>;
  /** Registered devices for the account dashboard, most-recently-seen first. */
  listDevices(userId: string): Promise<DeviceDTO[]>;
  /**
   * Update the push token on this user's device row (matched by stable deviceId).
   * Returns whether a row was actually updated (false ⇒ no such device for this user).
   */
  updatePushToken(userId: string, deviceId: string, pushToken: string): Promise<boolean>;
  /** This user's non-null push tokens for a platform (the send fan-out target). */
  listPushTokens(userId: string, platform: Platform): Promise<PushTarget[]>;
  /** Clear a device's push token (called when APNS reports it unregistered/invalid). */
  clearPushToken(userId: string, deviceId: string): Promise<void>;
  /** Recent login attempts for the account dashboard, newest first. */
  listLoginEvents(userId: string, limit?: number): Promise<LoginEventDTO[]>;
}

/** One push destination: a device's stable id plus its current push token. */
export interface PushTarget {
  deviceId: string;
  pushToken: string;
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
  /**
   * End the session: returns Set-Cookie values that clear the web session cookie
   * and revokes the current user's outstanding refresh tokens.
   */
  revoke(headers: Headers): Promise<{ cookies: string[] }>;
}

export interface AuthRouteDeps {
  otp: OtpService;
  users: UserRepository;
  sessions: SessionService;
  /** Deliver the code via your SMS provider. The code is never persisted in plaintext. */
  sms: (phone: string, code: string) => Promise<void>;
  config: {
    debugReturnCode: boolean;
    /**
     * Number of trusted reverse proxies that append `X-Forwarded-For`. The client IP
     * is read this many entries from the right of the XFF list. `0` (default) means
     * XFF is untrusted — see {@link clientIp}.
     */
    trustedProxyCount?: number;
  };
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

/**
 * Resolve the client IP for per-IP rate limiting, honouring the trusted-proxy
 * boundary.
 *
 * `X-Forwarded-For` is a client-controllable header: the *leftmost* entry is
 * whatever the original caller sent, so trusting it lets an attacker rotate fake
 * IPs to bypass the per-IP quota. Each trusted proxy in front of us *appends* the
 * address it saw, so the real client is `trustedProxyCount` entries from the
 * **right** of the list. Anything an attacker prepends sits further left and is
 * ignored.
 *
 * With `trustedProxyCount === 0` (the safe default) XFF is not trusted at all and
 * we fall back to `x-real-ip` — operators MUST set the real hop count to enable
 * per-IP limiting behind a proxy. See `TRUSTED_PROXY_COUNT` in `@infra/env/core`.
 */
export function clientIp(headers: Headers, trustedProxyCount = 0): string {
  if (trustedProxyCount > 0) {
    const list = (headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // Real client = the entry appended by the outermost trusted proxy. Clamp to 0
    // if the list is shorter than expected (misconfigured / fewer hops than claimed).
    const idx = Math.max(0, list.length - trustedProxyCount);
    const ip = list[idx];
    if (ip) return ip;
  }
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

export function createAuthRoutes(deps: AuthRouteDeps): Hono<ObsEnv> {
  const { otp, users, sessions, sms, config } = deps;
  const trustedProxyCount = config.trustedProxyCount ?? 0;
  const app = new Hono<ObsEnv>();

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
    const ip = clientIp(c.req.raw.headers, trustedProxyCount);
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
    const ip = clientIp(c.req.raw.headers, trustedProxyCount);

    const result = await otp.verifyCode({ phone, code });
    if (!result.ok) {
      // Audit the two attempts that carry a brute-force signal AND are bounded by the
      // per-code 5-attempt cap (otp.ts): a wrong guess (INVALID_CODE), and the wrong
      // guess that trips the lock (LOCKED with justLocked). Everything else is skipped
      // because /auth/otp/verify has no per-IP / global rate limit:
      //   • CODE_EXPIRED returns before the attempt counter increments (otp.ts) for a
      //     phone with no live code — an unauthenticated caller can hit it with any
      //     phone+code and never trigger a lock, so auditing it is an unbounded DB write.
      //   • an already-LOCKED phone returns straight from Redis with zero DB access; only
      //     the one lock-tripping guess (justLocked) is audited, so repeat LOCKED hits
      //     stay noise a caller cannot hammer to flood login_event / Postgres.
      // A brand-new phone has no user row yet, so userId is null and the event is keyed on
      // phone (login_event_phone_idx). The plaintext code is never recorded — only
      // phone / ip / platform / reason.
      const auditable =
        result.error === "INVALID_CODE" ||
        (result.error === "LOCKED" && result.justLocked === true);
      if (auditable) {
        try {
          const existing = await users.findByPhone(phone);
          await users.recordLoginEvent({
            userId: existing?.id ?? null,
            phone,
            platform,
            ip,
            deviceId: device?.deviceId,
            success: false,
            reason: result.error,
          });
        } catch (err) {
          // Auditing is best-effort: a transient Postgres outage must not turn a 401/423
          // (which only needs Redis) into a 500. Log and return the real auth error.
          c.get("log").warn("failed to audit login attempt", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
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

    const ip = clientIp(c.req.raw.headers, trustedProxyCount);
    const tokens = await sessions.refresh(parsed.data.refreshToken, { ip });
    if (!tokens) return fail(c, "INVALID_REFRESH_TOKEN");
    return c.json({ ok: true, tokens });
  });

  // ── Logout ────────────────────────────────────────────────────────────────────
  app.post("/auth/logout", async (c) => {
    const { cookies } = await sessions.revoke(c.req.raw.headers);
    for (const cookie of cookies) c.header("set-cookie", cookie, { append: true });
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

  // ── Update this device's push token (native acquires it after login) ─────────
  app.post("/auth/devices/push-token", async (c) => {
    const user = await sessions.requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");

    const parsed = updatePushTokenSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, "INVALID_REQUEST", { issues: parsed.error.issues });

    const updated = await users.updatePushToken(
      user.id,
      parsed.data.deviceId,
      parsed.data.pushToken,
    );
    // A missing device row means the client never registered this deviceId at verify
    // time; treat as an idempotent no-op (nothing to leak, nothing to error on).
    if (!updated) c.get("log").debug("push token update matched no device");
    return c.json({ ok: true });
  });

  // ── Account dashboard: this user's recent login attempts ─────────────────────
  app.get("/auth/login-events", async (c) => {
    const user = await sessions.requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");
    return c.json({ ok: true, events: await users.listLoginEvents(user.id) });
  });

  return app;
}
