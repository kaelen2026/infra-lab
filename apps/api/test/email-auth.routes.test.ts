import { createOtpService } from "@infra/auth";
import { FakeRedis } from "@infra/auth/testing";
import type { AuthTokens, DeviceInfo, Platform } from "@infra/shared";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createLogger } from "../src/observability/logger.js";
import { type ObsEnv, observability } from "../src/observability/middleware.js";
import type {
  SessionContext,
  SessionService,
  UserRecord,
  UserRepository,
} from "../src/routes/auth.routes.js";
import { createEmailAuthRoutes } from "../src/routes/email-auth.routes.js";

const EMAIL = "person@example.com";
const IP = "203.0.113.7";

// undici's Response.json() is typed as unknown; tests assert on dynamic shapes.
const readJson = (res: Response): Promise<any> => res.json() as Promise<any>;

// ── In-memory user repository (only the methods the email flow exercises do real
// work; the rest satisfy the interface). ────────────────────────────────────────
class FakeUserRepository implements UserRepository {
  users = new Map<string, UserRecord>();
  devices: Array<{ userId: string; device: DeviceInfo }> = [];
  events: Array<{
    userId: string | null;
    phone: string | null;
    platform: Platform;
    success: boolean;
    reason?: string;
  }> = [];
  private seq = 0;

  async findByPhone(phone: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((u) => u.phone === phone) ?? null;
  }
  async findByEmail(email: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }
  async findById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }
  async createWithProfile(phone: string): Promise<UserRecord> {
    const rec: UserRecord = {
      id: `user_${++this.seq}`,
      phone,
      email: null,
      displayName: null,
      avatarUrl: null,
      role: "user",
      createdAt: new Date("2026-06-30T00:00:00Z"),
    };
    this.users.set(rec.id, rec);
    return rec;
  }
  async createWithProfileByEmail(email: string): Promise<UserRecord> {
    const rec: UserRecord = {
      id: `user_${++this.seq}`,
      phone: null,
      email,
      displayName: null,
      avatarUrl: null,
      role: "user",
      createdAt: new Date("2026-06-30T00:00:00Z"),
    };
    this.users.set(rec.id, rec);
    return rec;
  }
  async ensureProfile(): Promise<boolean> {
    return false;
  }
  async attachPhone(
    userId: string,
    phone: string,
  ): Promise<
    | { ok: true; user: UserRecord }
    | { ok: false; error: "PHONE_ALREADY_LINKED" | "ALREADY_HAS_PHONE" }
  > {
    const user = this.users.get(userId);
    if (!user) return { ok: false, error: "ALREADY_HAS_PHONE" };
    const next: UserRecord = { ...user, phone };
    this.users.set(userId, next);
    return { ok: true, user: next };
  }
  async detachPhone(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) this.users.set(userId, { ...user, phone: null });
  }
  async updateProfile(): Promise<UserRecord | null> {
    return null;
  }
  async recordDevice(userId: string, device: DeviceInfo): Promise<void> {
    this.devices.push({ userId, device });
  }
  async recordLoginEvent(e: {
    userId: string | null;
    phone: string | null;
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
  async listDevices() {
    return [];
  }
  async updatePushToken() {
    return false;
  }
  async listPushTokens() {
    return [];
  }
  async clearPushToken() {}
  async listLoginEvents() {
    return [];
  }
}

class FakeSessionService implements SessionService {
  async issueWebSession(user: UserRecord, _ctx: SessionContext) {
    return { cookies: [`infra.session=web-${user.id}; Path=/; HttpOnly`] };
  }
  mintWebSessionCookie(userId: string): string {
    return `infra.session=web-${userId}; Path=/; HttpOnly`;
  }
  async issueWebSessionForUser() {
    return null;
  }
  async issueTokens(user: UserRecord, _ctx: SessionContext): Promise<AuthTokens> {
    return {
      accessToken: `access-${user.id}`,
      accessTokenExpiresIn: 900,
      refreshToken: `refresh-${user.id}`,
      refreshTokenExpiresIn: 2_592_000,
      tokenType: "Bearer",
    };
  }
  async refresh() {
    return null;
  }
  async requireUser() {
    return null;
  }
  async revoke() {
    return { cookies: [] };
  }
}

function setup(opts: { debugReturnCode?: boolean } = {}) {
  // Share the FakeRedis virtual clock with the OTP service so TTLs (code expiry,
  // resend cooldown) advance together and tests can fast-forward deterministically.
  const store = new FakeRedis();
  const otp = createOtpService({ store, secret: "s".repeat(32), now: store.now });
  const users = new FakeUserRepository();
  const sessions = new FakeSessionService();
  // Capture the delivered code so the test can complete the round-trip, exactly as a
  // real email client would carry it to the user.
  const sent: Array<{ email: string; code: string }> = [];
  const sendEmailOtp = async (email: string, code: string) => {
    sent.push({ email, code });
  };

  const app = new Hono<ObsEnv>();
  app.use("*", observability(createLogger({ level: "error" })));
  app.route(
    "/",
    createEmailAuthRoutes({
      otp,
      users,
      sessions,
      sendEmailOtp,
      config: { debugReturnCode: opts.debugReturnCode ?? false },
    }),
  );

  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": IP },
      body: JSON.stringify(body),
    });

  return { app, users, sent, store, post };
}

describe("email-auth routes", () => {
  it("rejects a malformed email with INVALID_REQUEST", async () => {
    const { post } = setup();
    const res = await post("/auth/otp/email/request", { email: "not-an-email", platform: "web" });
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("INVALID_REQUEST");
  });

  it("issues a code, delivers it by email, and echoes it only in debug mode", async () => {
    const { post, sent } = setup({ debugReturnCode: true });
    const res = await post("/auth/otp/email/request", { email: EMAIL, platform: "web" });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.ok).toBe(true);
    expect(body.ttlSeconds).toBeGreaterThan(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.email).toBe(EMAIL);
    // debug flag surfaces the same code that was delivered
    expect(body.debugCode).toBe(sent[0]!.code);
  });

  it("normalizes the email to lowercase before use", async () => {
    const { post, sent } = setup();
    const res = await post("/auth/otp/email/request", {
      email: "Person@Example.COM",
      platform: "web",
    });
    expect(res.status).toBe(200);
    expect(sent[0]!.email).toBe(EMAIL);
  });

  it("verifies a correct code, creating the account (login == register)", async () => {
    const { post, users, sent } = setup();
    await post("/auth/otp/email/request", { email: EMAIL, platform: "web" });
    const code = sent[0]!.code;

    const res = await post("/auth/otp/email/verify", { email: EMAIL, code, platform: "web" });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.ok).toBe(true);
    expect(body.user.isNew).toBe(true);
    expect(body.user.email).toBe(EMAIL);
    expect(body.user.phone).toBeNull();
    // web platform → HttpOnly cookie, no tokens in the body
    expect(res.headers.get("set-cookie")).toContain("infra.session=");
    expect(body.tokens).toBeUndefined();
    expect(users.events).toEqual([
      { userId: body.user.id, phone: null, platform: "web", success: true, reason: undefined },
    ]);
  });

  it("logs an existing email back into the SAME account (isNew false)", async () => {
    const { post, sent, store } = setup();
    // First login creates the account.
    await post("/auth/otp/email/request", { email: EMAIL, platform: "ios" });
    const first = await readJson(
      await post("/auth/otp/email/verify", {
        email: EMAIL,
        code: sent[0]!.code,
        platform: "ios",
      }),
    );
    expect(first.user.isNew).toBe(true);

    // Fast-forward past the resend cooldown, then log in again with a fresh code.
    store.advance(61);
    await post("/auth/otp/email/request", { email: EMAIL, platform: "ios" });
    const second = await readJson(
      await post("/auth/otp/email/verify", {
        email: EMAIL,
        code: sent[1]!.code,
        platform: "ios",
      }),
    );
    expect(second.user.isNew).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    // native platform → Bearer tokens in the body
    expect(second.tokens.tokenType).toBe("Bearer");
  });

  it("rejects a wrong code with INVALID_CODE and audits the attempt", async () => {
    const { post, users } = setup();
    await post("/auth/otp/email/request", { email: EMAIL, platform: "web" });
    const res = await post("/auth/otp/email/verify", {
      email: EMAIL,
      code: "000000",
      platform: "web",
    });
    expect(res.status).toBe(401);
    const body = await readJson(res);
    expect(body.code).toBe("INVALID_CODE");
    expect(body.remainingAttempts).toBeGreaterThanOrEqual(0);
    // failure is audited (phone null; subject not stored — see the route comment)
    expect(users.events).toEqual([
      {
        userId: null,
        phone: null,
        platform: "web",
        success: false,
        reason: "INVALID_CODE",
      },
    ]);
  });

  it("enforces the resend cooldown on an immediate second request", async () => {
    const { post } = setup();
    await post("/auth/otp/email/request", { email: EMAIL, platform: "web" });
    const res = await post("/auth/otp/email/request", { email: EMAIL, platform: "web" });
    expect(res.status).toBe(429);
    expect((await readJson(res)).code).toBe("RESEND_COOLDOWN");
  });
});
