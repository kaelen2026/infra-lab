import {
  type AuthErrorCode,
  isCookiePlatform,
  SOCIAL_ROUTE_PATTERNS,
  type SocialProvider,
  socialIdTokenSchema,
  socialProviderSchema,
  socialStartQuerySchema,
} from "@infra/shared";
import { type Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ObsEnv } from "../observability/middleware.js";
import {
  clientIp,
  type SessionContext,
  type SessionService,
  toAuthUser,
  type UserRepository,
} from "./auth.routes.js";

// ── Ports the routes depend on (implemented in src/services with Better Auth) ────
/** The user + provider profile hints resolved from a verified social ID token. */
export interface SocialSignIn {
  /** Our `user.id` (Better Auth found-or-created it from the provider account). */
  userId: string;
  /** Provider-supplied display name (e.g. Google `name`), for first-time provisioning. */
  displayName: string | null;
  /** Provider-supplied avatar (e.g. Google `picture`), for first-time provisioning. */
  avatarUrl: string | null;
}

/** Only the two failures the sign-in step itself can produce; other codes are route-level. */
export type SocialSignInError = Extract<
  AuthErrorCode,
  "SOCIAL_TOKEN_INVALID" | "SOCIAL_ACCOUNT_ERROR"
>;

export type SocialSignInOutcome =
  | { ok: true; data: SocialSignIn }
  | { ok: false; error: SocialSignInError };

/** Result of starting the web redirect flow: the provider authorization URL, or an error. */
export type SocialStartOutcome =
  | { ok: true; url: string }
  | { ok: false; error: SocialSignInError };

/**
 * Verifies a provider ID token and resolves it to one of our users. The adapter
 * (services/social-auth-service.ts) wraps Better Auth's `signInSocial`; tests inject
 * a fake so the route stays hermetic. This is the seam the design flags as highest
 * technical risk — kept behind a port so it can be exercised without touching Google.
 */
export interface SocialAuthService {
  /** Whether the provider has server-side credentials configured. */
  isEnabled(provider: SocialProvider): boolean;
  /** Verify an on-device ID token, find-or-create the user, return our user id + hints. */
  signInWithIdToken(input: {
    provider: SocialProvider;
    idToken: string;
    nonce?: string;
    accessToken?: string;
  }): Promise<SocialSignInOutcome>;
  /**
   * Begin the web redirect flow: ask Better Auth for the provider authorization URL
   * to send the browser to. `callbackURL` is where Better Auth 302s the browser after
   * its own OAuth callback completes — the app landing page (validated same-origin
   * upstream). The callback→our-session bridge happens in the `hooks.after` wired in
   * `createAuth` (see server.ts), not here.
   */
  startWebOAuth(input: {
    provider: SocialProvider;
    callbackURL: string;
  }): Promise<SocialStartOutcome>;
}

export interface SocialRouteDeps {
  social: SocialAuthService;
  // Narrowed to just what this route needs (ports & adapters): provisioning the
  // profile row Better Auth doesn't create, loading the user, and auditing.
  users: Pick<UserRepository, "ensureProfile" | "findById" | "recordDevice" | "recordLoginEvent">;
  sessions: Pick<SessionService, "issueWebSession" | "issueTokens">;
  config: {
    /** See `clientIp` — trusted reverse-proxy hop count for the audited/limited IP. */
    trustedProxyCount?: number;
    /**
     * Web origin the browser lands on after a redirect sign-in. The `redirect` query
     * (a validated same-origin path) is appended to it to form Better Auth's
     * `callbackURL`. This is `BETTER_AUTH_URL` (the web app origin).
     */
    webBaseUrl: string;
  };
}

type SocialErrorCode = Extract<
  AuthErrorCode,
  "INVALID_REQUEST" | "SOCIAL_PROVIDER_DISABLED" | SocialSignInError
>;

const ERROR_STATUS: Record<SocialErrorCode, ContentfulStatusCode> = {
  INVALID_REQUEST: 400,
  // Provider not configured, unknown provider, or a platform social sign-in doesn't
  // serve (weapp) — the capability simply isn't available here.
  SOCIAL_PROVIDER_DISABLED: 400,
  // ID token failed verification — same 401 posture as a wrong OTP.
  SOCIAL_TOKEN_INVALID: 401,
  // Provider verified the token but the account couldn't be established/loaded.
  SOCIAL_ACCOUNT_ERROR: 401,
};

export function createSocialRoutes(deps: SocialRouteDeps): Hono<ObsEnv> {
  const { social, users, sessions, config } = deps;
  const trustedProxyCount = config.trustedProxyCount ?? 0;
  const app = new Hono<ObsEnv>();

  const fail = (c: Context, code: SocialErrorCode, extra: Record<string, unknown> = {}) =>
    c.json({ ok: false, code, ...extra }, ERROR_STATUS[code]);

  async function readJson(c: Context): Promise<unknown> {
    try {
      return await c.req.json();
    } catch {
      return undefined;
    }
  }

  // ── Web / h5: begin the redirect flow ────────────────────────────────────────
  // The browser navigates here (full page). We ask Better Auth for the provider
  // authorization URL and 302 to it. After the provider calls back to Better Auth's
  // own `/api/auth/callback/:provider`, the `hooks.after` bridge (wired in createAuth)
  // swaps Better Auth's session cookie for our `infra.session`, then Better Auth 302s
  // the browser to `callbackURL` = webBaseUrl + the validated `redirect` path.
  app.get(SOCIAL_ROUTE_PATTERNS.startWebOAuth, async (c) => {
    const providerParsed = socialProviderSchema.safeParse(c.req.param("provider"));
    if (!providerParsed.success) return fail(c, "SOCIAL_PROVIDER_DISABLED");
    const provider = providerParsed.data;
    if (!social.isEnabled(provider)) return fail(c, "SOCIAL_PROVIDER_DISABLED");

    // `redirect` is a same-origin app path (validated by the schema — a single leading
    // `/`, never `//` or an absolute URL — so it can't bounce the authenticated
    // browser off-origin). Defaults to the app root.
    const q = socialStartQuerySchema.safeParse({ redirect: c.req.query("redirect") });
    if (!q.success) return fail(c, "INVALID_REQUEST", { issues: q.error.issues });

    const callbackURL = `${config.webBaseUrl}${q.data.redirect ?? "/"}`;
    const outcome = await social.startWebOAuth({ provider, callbackURL });
    if (!outcome.ok) return fail(c, outcome.error);
    return c.redirect(outcome.url);
  });

  // ── Native: exchange a provider ID token for a session (login == register) ─────
  // The client verified nothing itself — it just carries the provider's ID token.
  // We verify it server-side (through the port), find-or-create the user, provision
  // the profile Better Auth doesn't, and mint OUR session so the result is
  // indistinguishable downstream from an OTP sign-in.
  app.post(SOCIAL_ROUTE_PATTERNS.nativeIdToken, async (c) => {
    // Unknown provider segment → treat as "not available here" (no info leak about
    // which providers exist).
    const providerParsed = socialProviderSchema.safeParse(c.req.param("provider"));
    if (!providerParsed.success) return fail(c, "SOCIAL_PROVIDER_DISABLED");
    const provider = providerParsed.data;

    const parsed = socialIdTokenSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, "INVALID_REQUEST", { issues: parsed.error.issues });
    const { idToken, nonce, accessToken, platform, device } = parsed.data;

    // weapp is intentionally excluded from social sign-in (no system browser to have
    // carried an OAuth consent; not a Google market). Contract §1 in the design doc.
    if (platform === "weapp") return fail(c, "SOCIAL_PROVIDER_DISABLED");
    if (!social.isEnabled(provider)) return fail(c, "SOCIAL_PROVIDER_DISABLED");

    const outcome = await social.signInWithIdToken({ provider, idToken, nonce, accessToken });
    if (!outcome.ok) return fail(c, outcome.error);

    // Better Auth created the `user` (+ `account`) row but not our product `profile`
    // row — provision it idempotently. A fresh insert marks a brand-new account.
    const isNew = await users.ensureProfile(outcome.data.userId, {
      displayName: outcome.data.displayName,
      avatarUrl: outcome.data.avatarUrl,
    });
    const user = await users.findById(outcome.data.userId);
    // The row existed a line ago (Better Auth just wrote it); a null here means it
    // vanished mid-request — surface the provider path's error rather than a 500.
    if (!user) return fail(c, "SOCIAL_ACCOUNT_ERROR");

    const ip = clientIp(c.req.raw.headers, trustedProxyCount);
    if (device) await users.recordDevice(user.id, device);
    // Audit like a successful OTP verify. A Google-only account has no phone, so the
    // event's phone is null (login_event.phone is nullable for exactly this case).
    await users.recordLoginEvent({
      userId: user.id,
      phone: user.phone,
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

    // The native flow is Bearer-first, but mirror verifyOtp's platform branch so a
    // cookie platform (should it ever POST a token) gets the same treatment.
    if (isCookiePlatform(platform)) {
      const { cookies } = await sessions.issueWebSession(user, ctx);
      for (const cookie of cookies) c.header("set-cookie", cookie, { append: true });
      return c.json({ ok: true, user: toAuthUser(user, isNew) });
    }

    const tokens = await sessions.issueTokens(user, ctx);
    return c.json({ ok: true, user: toAuthUser(user, isNew), tokens });
  });

  return app;
}
