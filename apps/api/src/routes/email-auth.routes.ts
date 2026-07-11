import type { OtpService } from "@infra/auth";
import {
  type AuthErrorCode,
  isCookiePlatform,
  requestEmailOtpSchema,
  verifyEmailOtpSchema,
} from "@infra/shared";
import { type Context, Hono } from "hono";
import type { ObsEnv } from "../observability/middleware.js";
import {
  clientIp,
  ERROR_STATUS,
  type SessionContext,
  type SessionService,
  toAuthUser,
  type UserRepository,
} from "./auth.routes.js";

/**
 * Email-OTP login (login == register), the email counterpart of the phone-OTP flow in
 * `auth.routes.ts`. Split into its own module because `auth.routes.ts` is already at
 * the size heuristic (see conventions.md); the two share the OTP service, session
 * service and user repository.
 *
 * The OTP domain is identifier-agnostic (its Redis keys namespace on the opaque
 * subject), so the same {@link OtpService} instance backs both channels — an email
 * (`otp:code:foo@bar.com`) and an E.164 phone (`otp:code:+8613…`) never collide.
 * Delivery is injected as `sendEmailOtp`, matching the `sms` seam on the phone flow;
 * when Resend is unconfigured that resolves to the same dev log stub as SMS.
 */
export interface EmailAuthRouteDeps {
  otp: OtpService;
  users: UserRepository;
  sessions: SessionService;
  /** Deliver the code by email. The plaintext code is never persisted or logged. */
  sendEmailOtp: (email: string, code: string) => Promise<void>;
  config: {
    debugReturnCode: boolean;
    /** Trusted reverse-proxy hop count for client-IP resolution (see auth.routes). */
    trustedProxyCount?: number;
  };
}

export function createEmailAuthRoutes(deps: EmailAuthRouteDeps): Hono<ObsEnv> {
  const { otp, users, sessions, sendEmailOtp, config } = deps;
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

  // ── Send a code by email ─────────────────────────────────────────────────────
  app.post("/auth/otp/email/request", async (c) => {
    const parsed = requestEmailOtpSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, "INVALID_REQUEST", { issues: parsed.error.issues });

    const { email } = parsed.data;
    const ip = clientIp(c.req.raw.headers, trustedProxyCount);
    // The OTP service treats its `phone` parameter as an opaque subject — we pass the
    // email as that subject (see the module note on key namespacing).
    const res = await otp.requestCode({ phone: email, ip });
    if (!res.ok) return fail(c, res.error, { retryAfter: res.retryAfter });

    await sendEmailOtp(email, res.code);
    return c.json({
      ok: true,
      ttlSeconds: res.ttlSeconds,
      resendAfterSeconds: res.resendAfterSeconds,
      ...(config.debugReturnCode ? { debugCode: res.code } : {}),
    });
  });

  // ── Verify a code (login == register) ────────────────────────────────────────
  app.post("/auth/otp/email/verify", async (c) => {
    const parsed = verifyEmailOtpSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, "INVALID_REQUEST", { issues: parsed.error.issues });

    const { email, code, platform, device } = parsed.data;
    const ip = clientIp(c.req.raw.headers, trustedProxyCount);

    const result = await otp.verifyCode({ phone: email, code });
    if (!result.ok) {
      // Same bounded audit as the phone flow (auth.routes.ts): only the two failures
      // that carry a brute-force signal AND are capped by the per-code attempt limit.
      // login_event has no email column, so the subject is not stored — the userId
      // (for an existing account) links it; ip / platform / reason are recorded. The
      // Redis lock in the OTP service is the actual brute-force defence.
      const auditable =
        result.error === "INVALID_CODE" ||
        (result.error === "LOCKED" && result.justLocked === true);
      if (auditable) {
        try {
          const existing = await users.findByEmail(email);
          await users.recordLoginEvent({
            userId: existing?.id ?? null,
            phone: null,
            platform,
            ip,
            deviceId: device?.deviceId,
            success: false,
            reason: result.error,
          });
        } catch (err) {
          c.get("log").warn("failed to audit email login attempt", {
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

    // Find-or-create by email: a brand-new email gets a user + profile automatically.
    let user = await users.findByEmail(email);
    const isNew = user === null;
    if (!user) user = await users.createWithProfileByEmail(email);

    if (device) await users.recordDevice(user.id, device);
    await users.recordLoginEvent({
      userId: user.id,
      phone: null,
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

  return app;
}
