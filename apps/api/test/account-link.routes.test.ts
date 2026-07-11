import type { OtpService } from "@infra/auth";
import type { Platform, SocialProvider } from "@infra/shared";
import { describe, expect, it } from "vitest";
import {
  type AccountLinkRouteDeps,
  type AccountLinkService,
  createAccountLinkRoutes,
  type LinkSocialOutcome,
  type LinkStartOutcome,
} from "../src/routes/account-link.routes.js";
import type { UserRecord } from "../src/routes/auth.routes.js";

const readJson = (res: Response): Promise<any> => res.json() as Promise<any>;

const phoneUser: UserRecord = {
  id: "user_phone",
  phone: "+8613800138000",
  email: null,
  displayName: null,
  avatarUrl: null,
  role: "user",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const googleUser: UserRecord = { ...phoneUser, id: "user_google", phone: null };

class FakeUsers {
  records = new Map<string, UserRecord>([
    [phoneUser.id, phoneUser],
    [googleUser.id, googleUser],
  ]);
  events: Array<{ userId: string | null; reason?: string; platform: Platform }> = [];
  detached: string[] = [];

  async attachPhone(userId: string, phone: string) {
    const rec = this.records.get(userId);
    if (!rec || rec.phone) return { ok: false as const, error: "ALREADY_HAS_PHONE" as const };
    const owner = [...this.records.values()].find((u) => u.phone === phone);
    if (owner && owner.id !== userId) {
      return { ok: false as const, error: "PHONE_ALREADY_LINKED" as const };
    }
    const next: UserRecord = { ...rec, phone };
    this.records.set(userId, next);
    return { ok: true as const, user: next };
  }
  async detachPhone(userId: string) {
    this.detached.push(userId);
    const rec = this.records.get(userId);
    if (rec) this.records.set(userId, { ...rec, phone: null });
  }
  async recordLoginEvent(e: {
    userId: string | null;
    phone: string | null;
    platform: Platform;
    ip: string | null;
    success: boolean;
    reason?: string;
  }) {
    this.events.push({ userId: e.userId, reason: e.reason, platform: e.platform });
  }
}

function fakeLink(over: Partial<AccountLinkService> = {}): AccountLinkService & {
  unlinked: SocialProvider[];
} {
  const unlinked: SocialProvider[] = [];
  const base: AccountLinkService = {
    isEnabled: () => true,
    listProviders: async () => [],
    linkIdToken: async (): Promise<LinkSocialOutcome> => ({ ok: true }),
    startWebLink: async (): Promise<LinkStartOutcome> => ({
      ok: true,
      url: "https://accounts.google.com/o/oauth2/v2/auth?link=1",
    }),
    unlinkProvider: async (_userId, provider) => {
      unlinked.push(provider);
      return 1;
    },
  };
  return Object.assign({ unlinked }, base, over);
}

const okOtp: Pick<OtpService, "verifyCode"> = { verifyCode: async () => ({ ok: true }) };

function setup(
  opts: {
    currentUserId?: string | null;
    link?: AccountLinkService;
    otp?: Pick<OtpService, "verifyCode">;
  } = {},
) {
  const users = new FakeUsers();
  const current: { id: string | null } = {
    id: "currentUserId" in opts ? (opts.currentUserId ?? null) : "user_google",
  };
  const link = opts.link ?? fakeLink();
  const deps: AccountLinkRouteDeps = {
    link,
    users,
    sessions: {
      requireUser: async () => (current.id ? (users.records.get(current.id) ?? null) : null),
    },
    otp: opts.otp ?? okOtp,
    config: { webBaseUrl: "https://app.example", trustedProxyCount: 0 },
  };
  return { app: createAccountLinkRoutes(deps), users, link, current };
}

const jsonPost = (app: ReturnType<typeof createAccountLinkRoutes>, path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("account-link — identities", () => {
  it("reports phone presence + linked providers", async () => {
    const { app } = setup({
      currentUserId: "user_google",
      link: fakeLink({ listProviders: async () => ["google"] }),
    });
    const res = await app.request("/auth/identities");
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true, phone: false, providers: ["google"] });
  });

  it("401 when unauthenticated", async () => {
    const { app } = setup({ currentUserId: null });
    expect((await app.request("/auth/identities")).status).toBe(401);
  });
});

describe("account-link — link phone", () => {
  it("attaches the phone to a google-only user and audits link_phone", async () => {
    const { app, users } = setup({ currentUserId: "user_google" });
    const res = await jsonPost(app, "/auth/link/phone", {
      phone: "+8613900139000",
      code: "123456",
      platform: "web",
    });
    expect(res.status).toBe(200);
    expect((await readJson(res)).user.phone).toBe("+8613900139000");
    expect(users.events.at(-1)).toMatchObject({ reason: "link_phone", userId: "user_google" });
  });

  it("maps a wrong OTP to INVALID_CODE and does not attach", async () => {
    const { app, users } = setup({
      currentUserId: "user_google",
      otp: { verifyCode: async () => ({ ok: false, error: "INVALID_CODE", remainingAttempts: 2 }) },
    });
    const res = await jsonPost(app, "/auth/link/phone", {
      phone: "+8613900139000",
      code: "000000",
      platform: "web",
    });
    expect(res.status).toBe(401);
    expect((await readJson(res)).code).toBe("INVALID_CODE");
    expect(users.events).toHaveLength(0);
  });

  it("409 PHONE_ALREADY_LINKED when the phone belongs to another account", async () => {
    const { app } = setup({ currentUserId: "user_google" });
    const res = await jsonPost(app, "/auth/link/phone", {
      phone: phoneUser.phone, // owned by user_phone
      code: "123456",
      platform: "web",
    });
    expect(res.status).toBe(409);
    expect((await readJson(res)).code).toBe("PHONE_ALREADY_LINKED");
  });

  it("409 PHONE_ALREADY_LINKED when the account already has a phone", async () => {
    const { app } = setup({ currentUserId: "user_phone" });
    const res = await jsonPost(app, "/auth/link/phone", {
      phone: "+8613900139000",
      code: "123456",
      platform: "web",
    });
    expect(res.status).toBe(409);
    expect((await readJson(res)).code).toBe("PHONE_ALREADY_LINKED");
  });
});

describe("account-link — link social (native id token)", () => {
  it("links google and audits link_google", async () => {
    const { app, users } = setup({ currentUserId: "user_phone" });
    const res = await jsonPost(app, "/auth/link/social/google/token", {
      idToken: "eyJ.fake",
      platform: "ios",
    });
    expect(res.status).toBe(200);
    expect((await readJson(res)).ok).toBe(true);
    expect(users.events.at(-1)).toMatchObject({ reason: "link_google" });
  });

  it("409 SOCIAL_ALREADY_LINKED when the service reports a conflict", async () => {
    const { app } = setup({
      currentUserId: "user_phone",
      link: fakeLink({ linkIdToken: async () => ({ ok: false, error: "SOCIAL_ALREADY_LINKED" }) }),
    });
    const res = await jsonPost(app, "/auth/link/social/google/token", {
      idToken: "eyJ.fake",
      platform: "ios",
    });
    expect(res.status).toBe(409);
    expect((await readJson(res)).code).toBe("SOCIAL_ALREADY_LINKED");
  });

  it("401 SOCIAL_TOKEN_INVALID on a bad token", async () => {
    const { app } = setup({
      currentUserId: "user_phone",
      link: fakeLink({ linkIdToken: async () => ({ ok: false, error: "SOCIAL_TOKEN_INVALID" }) }),
    });
    const res = await jsonPost(app, "/auth/link/social/google/token", {
      idToken: "bad",
      platform: "ios",
    });
    expect(res.status).toBe(401);
    expect((await readJson(res)).code).toBe("SOCIAL_TOKEN_INVALID");
  });

  it("400 SOCIAL_PROVIDER_DISABLED when the provider is off / weapp / unknown", async () => {
    const disabled = setup({
      currentUserId: "user_phone",
      link: fakeLink({ isEnabled: () => false }),
    });
    expect(
      (
        await jsonPost(disabled.app, "/auth/link/social/google/token", {
          idToken: "x",
          platform: "ios",
        })
      ).status,
    ).toBe(400);

    const { app } = setup({ currentUserId: "user_phone" });
    expect(
      (await jsonPost(app, "/auth/link/social/google/token", { idToken: "x", platform: "weapp" }))
        .status,
    ).toBe(400);
    expect(
      (await jsonPost(app, "/auth/link/social/facebook/token", { idToken: "x", platform: "ios" }))
        .status,
    ).toBe(400);
  });
});

describe("account-link — link social (web redirect start)", () => {
  it("302s to the provider link URL", async () => {
    const { app } = setup({ currentUserId: "user_phone" });
    const res = await app.request("/auth/link/social/google/start?redirect=/account");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("accounts.google.com");
  });

  it("409 SOCIAL_ALREADY_LINKED when the user already has that provider", async () => {
    const { app } = setup({
      currentUserId: "user_google",
      link: fakeLink({ listProviders: async () => ["google"] }),
    });
    const res = await app.request("/auth/link/social/google/start");
    expect(res.status).toBe(409);
    expect((await readJson(res)).code).toBe("SOCIAL_ALREADY_LINKED");
  });
});

describe("account-link — unlink (conservation)", () => {
  it("unlinks the phone when a google account remains", async () => {
    const { app, users } = setup({
      currentUserId: "user_phone",
      link: fakeLink({ listProviders: async () => ["google"] }),
    });
    const res = await jsonPost(app, "/auth/unlink", { target: "phone", platform: "web" });
    expect(res.status).toBe(200);
    expect(users.detached).toEqual(["user_phone"]);
    expect(users.events.at(-1)).toMatchObject({ reason: "unlink_phone" });
  });

  it("409 LAST_CREDENTIAL when the phone is the only credential", async () => {
    const { app, users } = setup({
      currentUserId: "user_phone",
      link: fakeLink({ listProviders: async () => [] }),
    });
    const res = await jsonPost(app, "/auth/unlink", { target: "phone", platform: "web" });
    expect(res.status).toBe(409);
    expect((await readJson(res)).code).toBe("LAST_CREDENTIAL");
    expect(users.detached).toEqual([]);
  });

  it("unlinks google when a phone remains", async () => {
    const link = fakeLink({ listProviders: async () => ["google"] });
    const { app } = setup({ currentUserId: "user_phone", link }); // user_phone has a phone
    const res = await jsonPost(app, "/auth/unlink", { target: "google", platform: "web" });
    expect(res.status).toBe(200);
    expect(link.unlinked).toEqual(["google"]);
  });

  it("409 LAST_CREDENTIAL when google is the only credential", async () => {
    const link = fakeLink({ listProviders: async () => ["google"] });
    const { app } = setup({ currentUserId: "user_google", link }); // no phone
    const res = await jsonPost(app, "/auth/unlink", { target: "google", platform: "web" });
    expect(res.status).toBe(409);
    expect(link.unlinked).toEqual([]);
  });

  it("is idempotent when the target isn't linked", async () => {
    const { app } = setup({
      currentUserId: "user_google", // no phone
      link: fakeLink({ listProviders: async () => ["google"] }),
    });
    const res = await jsonPost(app, "/auth/unlink", { target: "phone", platform: "web" });
    expect(res.status).toBe(200);
    expect((await readJson(res)).ok).toBe(true);
  });
});
