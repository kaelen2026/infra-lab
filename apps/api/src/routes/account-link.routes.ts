import type { OtpService } from "@infra/auth";
import {
  type AuthErrorCode,
  linkPhoneSchema,
  linkSocialIdTokenSchema,
  SOCIAL_LINK_ROUTE_PATTERNS,
  type SocialProvider,
  socialProviderSchema,
  socialStartQuerySchema,
  unlinkSchema,
} from "@infra/shared";
import { type Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ObsEnv } from "../observability/middleware.js";
import { clientIp, type SessionService, toAuthUser, type UserRepository } from "./auth.routes.js";

// ── Ports the routes depend on ───────────────────────────────────────────────────
export type LinkSocialError = Extract<
  AuthErrorCode,
  "SOCIAL_ALREADY_LINKED" | "SOCIAL_TOKEN_INVALID" | "SOCIAL_ACCOUNT_ERROR"
>;
export type LinkSocialOutcome = { ok: true } | { ok: false; error: LinkSocialError };
export type LinkStartOutcome =
  | { ok: true; url: string }
  | { ok: false; error: Extract<AuthErrorCode, "SOCIAL_ALREADY_LINKED" | "SOCIAL_ACCOUNT_ERROR"> };

/**
 * Manages the `account` side of identities: which social providers a user has linked,
 * linking a provider (native ID-token or web redirect), and unlinking. The adapter
 * (services/account-link-service.ts) wraps Better Auth; tests inject a fake.
 */
export interface AccountLinkService {
  isEnabled(provider: SocialProvider): boolean;
  /** Social providers currently linked to this user. */
  listProviders(userId: string): Promise<SocialProvider[]>;
  /** Native: verify an on-device ID token and attach the provider to the current user. */
  linkIdToken(input: {
    userId: string;
    headers: Headers;
    provider: SocialProvider;
    idToken: string;
    nonce?: string;
    accessToken?: string;
  }): Promise<LinkSocialOutcome>;
  /** Web: build the provider authorization URL for a redirect LINK (session-scoped). */
  startWebLink(input: {
    headers: Headers;
    provider: SocialProvider;
    callbackURL: string;
  }): Promise<LinkStartOutcome>;
  /** Remove all of this user's account rows for a provider; returns how many were removed. */
  unlinkProvider(userId: string, provider: SocialProvider): Promise<number>;
}

export interface AccountLinkRouteDeps {
  link: AccountLinkService;
  users: Pick<UserRepository, "attachPhone" | "detachPhone" | "recordLoginEvent">;
  sessions: Pick<SessionService, "requireUser">;
  otp: Pick<OtpService, "verifyCode">;
  config: {
    webBaseUrl: string;
    trustedProxyCount?: number;
  };
}

type LinkErrorCode = Extract<
  AuthErrorCode,
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "SOCIAL_PROVIDER_DISABLED"
  | "SOCIAL_ALREADY_LINKED"
  | "SOCIAL_TOKEN_INVALID"
  | "SOCIAL_ACCOUNT_ERROR"
  | "PHONE_ALREADY_LINKED"
  | "LAST_CREDENTIAL"
  | "INVALID_CODE"
  | "CODE_EXPIRED"
  | "LOCKED"
>;

const ERROR_STATUS: Record<LinkErrorCode, ContentfulStatusCode> = {
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 401,
  SOCIAL_PROVIDER_DISABLED: 400,
  SOCIAL_TOKEN_INVALID: 401,
  SOCIAL_ACCOUNT_ERROR: 401,
  INVALID_CODE: 401,
  CODE_EXPIRED: 401,
  LOCKED: 423,
  // Linking conflicts: the target is taken, or unlinking would orphan the account.
  SOCIAL_ALREADY_LINKED: 409,
  PHONE_ALREADY_LINKED: 409,
  LAST_CREDENTIAL: 409,
};

export function createAccountLinkRoutes(deps: AccountLinkRouteDeps): Hono<ObsEnv> {
  const { link, users, sessions, otp, config } = deps;
  const trustedProxyCount = config.trustedProxyCount ?? 0;
  const app = new Hono<ObsEnv>();

  const fail = (c: Context, code: LinkErrorCode, extra: Record<string, unknown> = {}) =>
    c.json({ ok: false, code, ...extra }, ERROR_STATUS[code]);

  async function readJson(c: Context): Promise<unknown> {
    try {
      return await c.req.json();
    } catch {
      return undefined;
    }
  }

  // ── Current account's linked sign-in methods (account security screen) ─────────
  app.get(SOCIAL_LINK_ROUTE_PATTERNS.identities, async (c) => {
    const user = await sessions.requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");
    const providers = await link.listProviders(user.id);
    return c.json({ ok: true, phone: user.phone !== null, providers });
  });

  // ── Link a phone to the current account (OTP already requested for `phone`) ─────
  app.post(SOCIAL_LINK_ROUTE_PATTERNS.linkPhone, async (c) => {
    const user = await sessions.requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");

    const parsed = linkPhoneSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, "INVALID_REQUEST", { issues: parsed.error.issues });
    const { phone, code, platform } = parsed.data;

    const verified = await otp.verifyCode({ phone, code });
    if (!verified.ok) {
      const extra =
        verified.error === "INVALID_CODE"
          ? { remainingAttempts: verified.remainingAttempts }
          : verified.error === "LOCKED"
            ? { retryAfter: verified.retryAfter }
            : {};
      return fail(c, verified.error, extra);
    }

    // Attach to the CURRENT user (not find-or-create). Rejects when the phone belongs
    // to another account, or this account already has a phone — both surface as the
    // "phone slot is taken" conflict.
    const attached = await users.attachPhone(user.id, phone);
    if (!attached.ok) return fail(c, "PHONE_ALREADY_LINKED");

    const ip = clientIp(c.req.raw.headers, trustedProxyCount);
    await users.recordLoginEvent({
      userId: user.id,
      phone,
      platform,
      ip,
      success: true,
      reason: "link_phone",
    });
    return c.json({ ok: true, user: toAuthUser(attached.user, false) });
  });

  // ── Native: attach a provider via an on-device ID token ────────────────────────
  app.post(SOCIAL_LINK_ROUTE_PATTERNS.linkSocialToken, async (c) => {
    const user = await sessions.requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");

    const providerParsed = socialProviderSchema.safeParse(c.req.param("provider"));
    if (!providerParsed.success) return fail(c, "SOCIAL_PROVIDER_DISABLED");
    const provider = providerParsed.data;

    const parsed = linkSocialIdTokenSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, "INVALID_REQUEST", { issues: parsed.error.issues });
    const { idToken, nonce, accessToken, platform } = parsed.data;

    if (platform === "weapp") return fail(c, "SOCIAL_PROVIDER_DISABLED");
    if (!link.isEnabled(provider)) return fail(c, "SOCIAL_PROVIDER_DISABLED");

    const outcome = await link.linkIdToken({
      userId: user.id,
      headers: c.req.raw.headers,
      provider,
      idToken,
      nonce,
      accessToken,
    });
    if (!outcome.ok) return fail(c, outcome.error);

    const ip = clientIp(c.req.raw.headers, trustedProxyCount);
    await users.recordLoginEvent({
      userId: user.id,
      phone: user.phone,
      platform,
      ip,
      success: true,
      reason: `link_${provider}`,
    });
    return c.json({ ok: true });
  });

  // ── Web: begin a redirect LINK for the logged-in user ──────────────────────────
  // GET (a full-page navigation carrying the session cookie), mirroring the sign-in
  // start route: the account attachment only happens after the user completes Google
  // consent in the callback, so a bare GET here can't attach anything on its own.
  app.get(SOCIAL_LINK_ROUTE_PATTERNS.linkSocialStart, async (c) => {
    const user = await sessions.requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");

    const providerParsed = socialProviderSchema.safeParse(c.req.param("provider"));
    if (!providerParsed.success) return fail(c, "SOCIAL_PROVIDER_DISABLED");
    const provider = providerParsed.data;
    if (!link.isEnabled(provider)) return fail(c, "SOCIAL_PROVIDER_DISABLED");

    const q = socialStartQuerySchema.safeParse({ redirect: c.req.query("redirect") });
    if (!q.success) return fail(c, "INVALID_REQUEST", { issues: q.error.issues });

    // One provider account per user: refuse to start a second Google link.
    const providers = await link.listProviders(user.id);
    if (providers.includes(provider)) return fail(c, "SOCIAL_ALREADY_LINKED");

    const callbackURL = `${config.webBaseUrl}${q.data.redirect ?? "/"}`;
    const outcome = await link.startWebLink({ headers: c.req.raw.headers, provider, callbackURL });
    if (!outcome.ok) return fail(c, outcome.error);
    return c.redirect(outcome.url);
  });

  // ── Unlink a credential, enforcing "keep ≥1 way to sign in" ────────────────────
  app.post(SOCIAL_LINK_ROUTE_PATTERNS.unlink, async (c) => {
    const user = await sessions.requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");

    const parsed = unlinkSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, "INVALID_REQUEST", { issues: parsed.error.issues });
    const { target, platform } = parsed.data;

    const hasPhone = user.phone !== null;
    const providers = await link.listProviders(user.id);
    const ip = clientIp(c.req.raw.headers, trustedProxyCount);
    // Phone is a credential too, though it isn't a Better Auth `account` row — count it.
    const credentialCount = (hasPhone ? 1 : 0) + providers.length;

    if (target === "phone") {
      if (!hasPhone) return c.json({ ok: true }); // nothing linked — idempotent
      if (credentialCount <= 1) return fail(c, "LAST_CREDENTIAL");
      await users.detachPhone(user.id);
    } else {
      if (!providers.includes(target)) return c.json({ ok: true }); // idempotent
      if (credentialCount <= 1) return fail(c, "LAST_CREDENTIAL");
      await link.unlinkProvider(user.id, target);
    }

    await users.recordLoginEvent({
      userId: user.id,
      phone: user.phone,
      platform,
      ip,
      success: true,
      reason: `unlink_${target}`,
    });
    return c.json({ ok: true });
  });

  return app;
}
