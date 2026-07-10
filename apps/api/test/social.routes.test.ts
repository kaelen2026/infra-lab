import type { DeviceInfo, Platform } from "@infra/shared";
import { describe, expect, it } from "vitest";
import type { SessionContext, UserRecord } from "../src/routes/auth.routes.js";
import {
  createSocialRoutes,
  type SocialAuthService,
  type SocialRouteDeps,
  type SocialSignInOutcome,
  type SocialStartOutcome,
} from "../src/routes/social.routes.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth?client_id=test&state=abc";

// undici's Response.json() is typed as unknown; tests assert on dynamic shapes.
const readJson = (res: Response): Promise<any> => res.json() as Promise<any>;

const GOOGLE_USER_ID = "user_google_1";

// ── In-memory user repository (only the four methods the route uses) ─────────────
class FakeUsers {
  records = new Map<string, UserRecord>();
  profiles = new Set<string>();
  devices: Array<{ userId: string; device: DeviceInfo }> = [];
  events: Array<{ userId: string | null; phone: string | null; platform: Platform }> = [];

  seed(record: UserRecord): void {
    this.records.set(record.id, record);
  }
  async ensureProfile(
    userId: string,
    hints: { displayName?: string | null; avatarUrl?: string | null },
  ): Promise<boolean> {
    if (this.profiles.has(userId)) return false;
    this.profiles.add(userId);
    const rec = this.records.get(userId);
    if (rec) {
      this.records.set(userId, {
        ...rec,
        displayName: hints.displayName ?? rec.displayName,
        avatarUrl: hints.avatarUrl ?? rec.avatarUrl,
      });
    }
    return true;
  }
  async findById(id: string): Promise<UserRecord | null> {
    return this.records.get(id) ?? null;
  }
  async recordDevice(userId: string, device: DeviceInfo): Promise<void> {
    this.devices.push({ userId, device });
  }
  async recordLoginEvent(e: {
    userId: string | null;
    phone: string | null;
    platform: Platform;
  }): Promise<void> {
    this.events.push({ userId: e.userId, phone: e.phone, platform: e.platform });
  }
}

// ── In-memory session service (only issue* used by this route) ───────────────────
const fakeSessions = {
  async issueWebSession(user: UserRecord, _ctx: SessionContext) {
    return { cookies: [`infra.session=cookie_${user.id}; Path=/; HttpOnly`] };
  },
  async issueTokens(user: UserRecord, _ctx: SessionContext) {
    return {
      accessToken: `at_${user.id}`,
      accessTokenExpiresIn: 900,
      refreshToken: `rt_${user.id}`,
      refreshTokenExpiresIn: 2_592_000,
      tokenType: "Bearer" as const,
    };
  },
};

// A configurable fake social service: pick the outcomes + which providers are enabled.
function fakeSocial(
  outcome: SocialSignInOutcome,
  enabled: readonly string[] = ["google"],
  startOutcome: SocialStartOutcome = { ok: true, url: GOOGLE_AUTH_URL },
): SocialAuthService {
  return {
    isEnabled: (provider) => enabled.includes(provider),
    signInWithIdToken: async () => outcome,
    startWebOAuth: async () => startOutcome,
  };
}

function setup(opts: { social?: SocialAuthService; seedUser?: UserRecord | null } = {}) {
  const users = new FakeUsers();
  const googleUser: UserRecord = {
    id: GOOGLE_USER_ID,
    phone: null, // a Google-only account has no phone
    displayName: null,
    avatarUrl: null,
    role: "user",
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
  };
  if (opts.seedUser !== null) users.seed(opts.seedUser ?? googleUser);

  const social =
    opts.social ??
    fakeSocial({
      ok: true,
      data: { userId: GOOGLE_USER_ID, displayName: "Ada Lovelace", avatarUrl: "https://x/a.png" },
    });

  const deps: SocialRouteDeps = {
    social,
    users,
    sessions: fakeSessions,
    config: { trustedProxyCount: 0, webBaseUrl: "https://app.example" },
  };
  return { app: createSocialRoutes(deps), users };
}

function postToken(app: ReturnType<typeof createSocialRoutes>, provider: string, body: unknown) {
  return app.request(`/auth/social/${provider}/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const iosBody = {
  idToken: "eyJ.fake.jwt",
  platform: "ios" as Platform,
  device: { platform: "ios" as Platform, deviceId: "dev-1", model: "iPhone" },
};

describe("social routes — web redirect start", () => {
  it("302s to the provider authorization URL", async () => {
    const { app } = setup();
    const res = await app.request("/auth/social/google/start?redirect=/account");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(GOOGLE_AUTH_URL);
  });

  it("builds callbackURL from webBaseUrl + the validated redirect path", async () => {
    let seenCallbackURL = "";
    const social: SocialAuthService = {
      isEnabled: () => true,
      signInWithIdToken: async () => ({ ok: false, error: "SOCIAL_ACCOUNT_ERROR" }),
      startWebOAuth: async ({ callbackURL }) => {
        seenCallbackURL = callbackURL;
        return { ok: true, url: GOOGLE_AUTH_URL };
      },
    };
    const { app } = setup({ social });
    await app.request("/auth/social/google/start?redirect=/account");
    expect(seenCallbackURL).toBe("https://app.example/account");

    // No redirect → defaults to the app root.
    await app.request("/auth/social/google/start");
    expect(seenCallbackURL).toBe("https://app.example/");
  });

  it("400s an open-redirect attempt (protocol-relative // path)", async () => {
    const { app } = setup();
    const res = await app.request(
      `/auth/social/google/start?redirect=${encodeURIComponent("//evil.example/x")}`,
    );
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("INVALID_REQUEST");
  });

  it("400s an absolute-URL redirect", async () => {
    const { app } = setup();
    const res = await app.request(
      `/auth/social/google/start?redirect=${encodeURIComponent("https://evil.example")}`,
    );
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("INVALID_REQUEST");
  });

  it("400 SOCIAL_PROVIDER_DISABLED when the provider is not configured", async () => {
    const { app } = setup({
      social: fakeSocial({ ok: false, error: "SOCIAL_ACCOUNT_ERROR" }, []),
    });
    const res = await app.request("/auth/social/google/start");
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("SOCIAL_PROVIDER_DISABLED");
  });

  it("400 SOCIAL_PROVIDER_DISABLED for an unknown provider segment", async () => {
    const { app } = setup();
    const res = await app.request("/auth/social/facebook/start");
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("SOCIAL_PROVIDER_DISABLED");
  });

  it("surfaces a start failure as 401 SOCIAL_ACCOUNT_ERROR", async () => {
    const { app } = setup({
      social: fakeSocial({ ok: false, error: "SOCIAL_ACCOUNT_ERROR" }, ["google"], {
        ok: false,
        error: "SOCIAL_ACCOUNT_ERROR",
      }),
    });
    const res = await app.request("/auth/social/google/start");
    expect(res.status).toBe(401);
    expect((await readJson(res)).code).toBe("SOCIAL_ACCOUNT_ERROR");
  });
});

describe("social routes — native id token, success", () => {
  it("verifies, provisions a new profile, and returns Bearer tokens isomorphic to verifyOtp", async () => {
    const { app, users } = setup();
    const res = await postToken(app, "google", iosBody);
    expect(res.status).toBe(200);
    const body = await readJson(res);

    expect(body.ok).toBe(true);
    // isNew is true: ensureProfile inserted the profile on first sign-in.
    expect(body.user).toMatchObject({ id: GOOGLE_USER_ID, phone: null, isNew: true });
    // Provider hints seeded the profile.
    expect(body.user.displayName).toBe("Ada Lovelace");
    // Native → Bearer tokens present (no cookie).
    expect(body.tokens).toMatchObject({ tokenType: "Bearer", accessToken: `at_${GOOGLE_USER_ID}` });
    expect(res.headers.get("set-cookie")).toBeNull();

    // Device recorded + login event audited with a null phone.
    expect(users.devices).toHaveLength(1);
    expect(users.events).toEqual([{ userId: GOOGLE_USER_ID, phone: null, platform: "ios" }]);
  });

  it("reports isNew=false for a returning user (profile already exists)", async () => {
    const { app, users } = setup();
    users.profiles.add(GOOGLE_USER_ID); // pretend the profile was created on a prior sign-in
    const res = await postToken(app, "google", iosBody);
    const body = await readJson(res);
    expect(body.user.isNew).toBe(false);
  });

  it("issues a cookie (not tokens) when a cookie platform posts a token", async () => {
    const { app } = setup();
    const res = await postToken(app, "google", { idToken: "eyJ.fake", platform: "web" });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.tokens).toBeUndefined();
    expect(res.headers.get("set-cookie")).toContain("infra.session=");
  });
});

describe("social routes — apple provider (native id token)", () => {
  // Apple is a valid provider segment now (SOCIAL_PROVIDERS). When enabled, the route
  // is provider-agnostic: same success shape as Google. Apple's on-device idToken
  // usually carries no name, so displayName commonly resolves to null — assert that.
  it("signs in via /auth/social/apple/token when apple is enabled", async () => {
    const { app, users } = setup({
      social: fakeSocial(
        { ok: true, data: { userId: GOOGLE_USER_ID, displayName: null, avatarUrl: null } },
        ["apple"],
      ),
    });
    const res = await postToken(app, "apple", iosBody);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.ok).toBe(true);
    expect(body.user).toMatchObject({ id: GOOGLE_USER_ID, phone: null, isNew: true });
    expect(body.user.displayName).toBeNull();
    expect(body.tokens).toMatchObject({ tokenType: "Bearer" });
    expect(users.events).toEqual([{ userId: GOOGLE_USER_ID, phone: null, platform: "ios" }]);
  });

  it("400 SOCIAL_PROVIDER_DISABLED for apple when only google is configured", async () => {
    const { app } = setup(); // default fakeSocial enables ["google"] only
    const res = await postToken(app, "apple", iosBody);
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("SOCIAL_PROVIDER_DISABLED");
  });
});

describe("social routes — native id token, rejections", () => {
  it("400 SOCIAL_PROVIDER_DISABLED when the provider is not configured", async () => {
    const { app } = setup({
      social: fakeSocial(
        { ok: true, data: { userId: "x", displayName: null, avatarUrl: null } },
        [],
      ),
    });
    const res = await postToken(app, "google", iosBody);
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("SOCIAL_PROVIDER_DISABLED");
  });

  it("400 SOCIAL_PROVIDER_DISABLED for the excluded weapp platform", async () => {
    const { app } = setup();
    const res = await postToken(app, "google", { idToken: "eyJ.fake", platform: "weapp" });
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("SOCIAL_PROVIDER_DISABLED");
  });

  it("400 SOCIAL_PROVIDER_DISABLED for an unknown provider segment", async () => {
    const { app } = setup();
    const res = await postToken(app, "facebook", iosBody);
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("SOCIAL_PROVIDER_DISABLED");
  });

  it("400 INVALID_REQUEST for a malformed body (missing idToken)", async () => {
    const { app } = setup();
    const res = await postToken(app, "google", { platform: "ios" });
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("INVALID_REQUEST");
  });

  it("401 SOCIAL_TOKEN_INVALID when the token fails verification", async () => {
    const { app, users } = setup({
      social: fakeSocial({ ok: false, error: "SOCIAL_TOKEN_INVALID" }),
    });
    const res = await postToken(app, "google", iosBody);
    expect(res.status).toBe(401);
    expect((await readJson(res)).code).toBe("SOCIAL_TOKEN_INVALID");
    // A rejected sign-in touches nothing downstream.
    expect(users.events).toHaveLength(0);
    expect(users.devices).toHaveLength(0);
  });

  it("401 SOCIAL_ACCOUNT_ERROR when the account cannot be established", async () => {
    const { app } = setup({ social: fakeSocial({ ok: false, error: "SOCIAL_ACCOUNT_ERROR" }) });
    const res = await postToken(app, "google", iosBody);
    expect(res.status).toBe(401);
    expect((await readJson(res)).code).toBe("SOCIAL_ACCOUNT_ERROR");
  });

  it("401 SOCIAL_ACCOUNT_ERROR when the verified user vanished before load", async () => {
    // signInWithIdToken resolves a userId the repository doesn't have.
    const { app } = setup({ seedUser: null });
    const res = await postToken(app, "google", iosBody);
    expect(res.status).toBe(401);
    expect((await readJson(res)).code).toBe("SOCIAL_ACCOUNT_ERROR");
  });
});
