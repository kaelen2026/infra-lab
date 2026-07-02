import { createOtpService } from "@infra/auth";
import { FakeRedis } from "@infra/auth/testing";
import type { AuthTokens, DeviceInfo, Platform } from "@infra/shared";
import { describe, expect, it } from "vitest";
import {
  createAuthRoutes,
  type SessionContext,
  type SessionService,
  type UserRecord,
  type UserRepository,
} from "../src/routes/auth.routes.js";

const PHONE = "+8613800138000";
const IP = "203.0.113.7";

// undici's Response.json() is typed as unknown; tests assert on dynamic shapes.
const readJson = (res: Response): Promise<any> => res.json() as Promise<any>;

// ── In-memory user repository ──────────────────────────────────────────────────
class FakeUserRepository implements UserRepository {
  users = new Map<string, UserRecord>();
  devices: Array<{ userId: string; device: DeviceInfo }> = [];
  events: Array<{
    userId: string | null;
    phone: string;
    platform: Platform;
    success: boolean;
    reason?: string;
  }> = [];
  private seq = 0;

  async findByPhone(phone: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((u) => u.phone === phone) ?? null;
  }
  async createWithProfile(phone: string): Promise<UserRecord> {
    const id = `user_${++this.seq}`;
    const rec: UserRecord = {
      id,
      phone,
      displayName: null,
      avatarUrl: null,
      createdAt: new Date("2026-06-30T00:00:00Z"),
    };
    this.users.set(id, rec);
    return rec;
  }
  async recordDevice(userId: string, device: DeviceInfo): Promise<void> {
    this.devices.push({ userId, device });
  }
  async recordLoginEvent(e: {
    userId: string | null;
    phone: string;
    platform: Platform;
    ip: string;
    deviceId?: string;
    success: boolean;
    reason?: string;
  }): Promise<void> {
    this.events.push({
      userId: e.userId,
      phone: e.phone,
      platform: e.platform,
      success: e.success,
      reason: e.reason,
    });
  }
  async listDevices(userId: string) {
    return this.devices
      .filter((d) => d.userId === userId)
      .map((d, i) => ({
        id: `dev_${i}`,
        platform: d.device.platform,
        deviceId: d.device.deviceId,
        model: d.device.model ?? null,
        osVersion: d.device.osVersion ?? null,
        appVersion: d.device.appVersion ?? null,
        lastSeenAt: "2026-06-30T00:00:00.000Z",
        createdAt: "2026-06-30T00:00:00.000Z",
      }));
  }
  async listLoginEvents(userId: string) {
    return this.events
      .filter((e) => e.userId === userId)
      .map((e, i) => ({
        id: `evt_${i}`,
        platform: e.platform,
        ip: null,
        success: e.success,
        reason: e.reason ?? null,
        createdAt: "2026-06-30T00:00:00.000Z",
      }));
  }
}

// ── Fake session service ────────────────────────────────────────────────────────
class FakeSessionService implements SessionService {
  issuedTokens: AuthTokens[] = [];
  private refreshStore = new Map<string, string>(); // refreshToken -> userId
  private seq = 0;

  async issueWebSession(user: UserRecord, _ctx: SessionContext): Promise<{ cookies: string[] }> {
    const token = `sess_${user.id}_${++this.seq}`;
    return {
      cookies: [`infra.session=${token}; Path=/; HttpOnly; SameSite=Lax`],
    };
  }
  async issueTokens(user: UserRecord, _ctx: SessionContext): Promise<AuthTokens> {
    const refreshToken = `refresh_${user.id}_${++this.seq}`;
    this.refreshStore.set(refreshToken, user.id);
    const tokens: AuthTokens = {
      accessToken: `access_${user.id}_${this.seq}`,
      accessTokenExpiresIn: 900,
      refreshToken,
      refreshTokenExpiresIn: 2_592_000,
      tokenType: "Bearer",
    };
    this.issuedTokens.push(tokens);
    return tokens;
  }
  async refresh(refreshToken: string): Promise<AuthTokens | null> {
    const userId = this.refreshStore.get(refreshToken);
    if (!userId) return null;
    this.refreshStore.delete(refreshToken); // rotation
    const next = `refresh_${userId}_${++this.seq}`;
    this.refreshStore.set(next, userId);
    return {
      accessToken: `access_${userId}_${this.seq}`,
      accessTokenExpiresIn: 900,
      refreshToken: next,
      refreshTokenExpiresIn: 2_592_000,
      tokenType: "Bearer",
    };
  }
  async requireUser(): Promise<UserRecord | null> {
    return null;
  }
  async revoke(): Promise<{ cookies: string[] }> {
    // Sign-out-all: drop every issued refresh token, mirroring the real service.
    this.refreshStore.clear();
    return { cookies: ["infra.session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"] };
  }
}

function setup() {
  const store = new FakeRedis();
  const otp = createOtpService({ store, secret: "route-test-secret", now: store.now });
  const users = new FakeUserRepository();
  const sessions = new FakeSessionService();
  const sentSms: Array<{ phone: string; code: string }> = [];
  const app = createAuthRoutes({
    otp,
    users,
    sessions,
    sms: async (phone, code) => {
      sentSms.push({ phone, code });
    },
    config: { debugReturnCode: false },
  });
  return { app, store, otp, users, sessions, sentSms };
}

function post(
  app: ReturnType<typeof createAuthRoutes>,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": IP, ...headers },
    body: JSON.stringify(body),
  });
}

async function getCode(
  sentSms: Array<{ phone: string; code: string }>,
  app: ReturnType<typeof createAuthRoutes>,
) {
  await post(app, "/auth/otp/request", { phone: PHONE, platform: "web" });
  return sentSms.at(-1)!.code;
}

describe("POST /auth/otp/request", () => {
  it("sends a code via SMS and returns ttl + cooldown", async () => {
    const { app, sentSms } = setup();
    const res = await post(app, "/auth/otp/request", { phone: PHONE, platform: "web" });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.ok).toBe(true);
    expect(body.ttlSeconds).toBe(300);
    expect(body.resendAfterSeconds).toBe(60);
    expect(sentSms).toHaveLength(1);
    expect(sentSms[0]!.code).toMatch(/^\d{6}$/);
    // code is never returned to the client unless debug flag is on
    expect(body.debugCode).toBeUndefined();
  });

  it("rejects a malformed phone with 400", async () => {
    const { app } = setup();
    const res = await post(app, "/auth/otp/request", { phone: "12345", platform: "web" });
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("INVALID_REQUEST");
  });

  it("rejects a resend within 60s with 429 RESEND_COOLDOWN", async () => {
    const { app } = setup();
    await post(app, "/auth/otp/request", { phone: PHONE, platform: "web" });
    const res = await post(app, "/auth/otp/request", { phone: PHONE, platform: "web" });
    expect(res.status).toBe(429);
    const body = await readJson(res);
    expect(body.code).toBe("RESEND_COOLDOWN");
    expect(body.retryAfter).toBeGreaterThan(0);
  });
});

describe("POST /auth/otp/verify — new phone", () => {
  it("creates a user + profile and (web) sets an HttpOnly cookie, no body tokens", async () => {
    const { app, sentSms, users } = setup();
    const code = await getCode(sentSms, app);

    const res = await post(app, "/auth/otp/verify", { phone: PHONE, code, platform: "web" });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.ok).toBe(true);
    expect(body.user.phone).toBe(PHONE);
    expect(body.user.isNew).toBe(true);
    expect(body.tokens).toBeUndefined(); // web uses cookie

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");

    expect(await users.findByPhone(PHONE)).not.toBeNull();
    expect(users.events.at(-1)).toMatchObject({ success: true, platform: "web" });
  });

  it("returns accessToken + refreshToken (no cookie) for native platforms", async () => {
    const { app, sentSms } = setup();
    const code = await getCode(sentSms, app);

    const device = { platform: "ios" as const, deviceId: "iphone-abc" };
    const res = await post(app, "/auth/otp/verify", {
      phone: PHONE,
      code,
      platform: "ios",
      device,
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.tokens.tokenType).toBe("Bearer");
    expect(body.tokens.accessToken).toBeTruthy();
    expect(body.tokens.refreshToken).toBeTruthy();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("marks an existing phone as not new on the second login", async () => {
    const { app, store, sentSms } = setup();
    const code1 = await getCode(sentSms, app);
    await post(app, "/auth/otp/verify", { phone: PHONE, code: code1, platform: "web" });

    store.advance(60); // clear the resend cooldown before logging in again
    const code2 = await getCode(sentSms, app);
    const res = await post(app, "/auth/otp/verify", { phone: PHONE, code: code2, platform: "web" });
    expect((await readJson(res)).user.isNew).toBe(false);
  });
});

describe("POST /auth/otp/verify — failure paths", () => {
  it("rejects a wrong code with 401 INVALID_CODE and remaining attempts", async () => {
    const { app, sentSms } = setup();
    await getCode(sentSms, app);
    const res = await post(app, "/auth/otp/verify", {
      phone: PHONE,
      code: "000000",
      platform: "web",
    });
    expect(res.status).toBe(401);
    const body = await readJson(res);
    expect(body.code).toBe("INVALID_CODE");
    expect(body.remainingAttempts).toBe(4);
  });

  it("audits a failed attempt with success:false + reason (unknown phone → null userId)", async () => {
    const { app, sentSms, users } = setup();
    await getCode(sentSms, app);
    await post(app, "/auth/otp/verify", { phone: PHONE, code: "000000", platform: "web" });
    // A brand-new phone has no user yet: the failure is audited keyed on phone.
    expect(users.events.at(-1)).toMatchObject({
      success: false,
      reason: "INVALID_CODE",
      phone: PHONE,
      userId: null,
      platform: "web",
    });
  });

  it("audits a failed attempt against an existing account with its userId", async () => {
    const { app, store, sentSms, users } = setup();
    // First, register the phone via a successful login.
    const code = await getCode(sentSms, app);
    await post(app, "/auth/otp/verify", { phone: PHONE, code, platform: "web" });
    const user = await users.findByPhone(PHONE);
    expect(user).not.toBeNull();

    // Then a wrong code: the failure event carries the existing user's id + reason.
    store.advance(60);
    await getCode(sentSms, app);
    await post(app, "/auth/otp/verify", { phone: PHONE, code: "000000", platform: "web" });
    expect(users.events.at(-1)).toMatchObject({
      success: false,
      reason: "INVALID_CODE",
      userId: user?.id,
    });
  });

  it("audits an expired/replayed code as success:false + CODE_EXPIRED", async () => {
    const { app, sentSms, users } = setup();
    const code = await getCode(sentSms, app);
    await post(app, "/auth/otp/verify", { phone: PHONE, code, platform: "web" });
    // Replaying the now-consumed code is a failed attempt and must be audited.
    await post(app, "/auth/otp/verify", { phone: PHONE, code, platform: "web" });
    expect(users.events.at(-1)).toMatchObject({ success: false, reason: "CODE_EXPIRED" });
  });

  it("locks the phone after 5 wrong codes (423 LOCKED)", async () => {
    const { app, sentSms } = setup();
    await getCode(sentSms, app);
    let res!: Response;
    for (let i = 0; i < 5; i++) {
      res = await post(app, "/auth/otp/verify", { phone: PHONE, code: "111111", platform: "web" });
    }
    expect(res.status).toBe(423);
    expect((await readJson(res)).code).toBe("LOCKED");
  });

  it("accepts a correct code only once (replay rejected)", async () => {
    const { app, sentSms } = setup();
    const code = await getCode(sentSms, app);
    const first = await post(app, "/auth/otp/verify", { phone: PHONE, code, platform: "web" });
    expect(first.status).toBe(200);
    const replay = await post(app, "/auth/otp/verify", { phone: PHONE, code, platform: "web" });
    expect(replay.status).toBe(401);
    expect((await readJson(replay)).code).toBe("CODE_EXPIRED");
  });
});

describe("POST /auth/refresh", () => {
  it("rotates a valid refresh token", async () => {
    const { app, sentSms } = setup();
    const code = await getCode(sentSms, app);
    const verify = await post(app, "/auth/otp/verify", {
      phone: PHONE,
      code,
      platform: "android",
      device: { platform: "android", deviceId: "pixel-1" },
    });
    const { tokens } = await readJson(verify);

    const res = await post(app, "/auth/refresh", { refreshToken: tokens.refreshToken });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.tokens.refreshToken).not.toBe(tokens.refreshToken);

    // the old token no longer works after rotation
    const reuse = await post(app, "/auth/refresh", { refreshToken: tokens.refreshToken });
    expect(reuse.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("clears the HttpOnly session cookie (expired Set-Cookie)", async () => {
    const { app } = setup();
    const res = await app.request("/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
    expect((await readJson(res)).ok).toBe(true);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("infra.session=");
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("HttpOnly");
  });

  it("revokes outstanding refresh tokens so they can no longer rotate", async () => {
    const { app, sentSms } = setup();
    const code = await getCode(sentSms, app);
    const verify = await post(app, "/auth/otp/verify", {
      phone: PHONE,
      code,
      platform: "android",
      device: { platform: "android", deviceId: "pixel-1" },
    });
    const { tokens } = await readJson(verify);

    const logout = await app.request("/auth/logout", { method: "POST" });
    expect(logout.status).toBe(200);

    const reuse = await post(app, "/auth/refresh", { refreshToken: tokens.refreshToken });
    expect(reuse.status).toBe(401);
  });
});
