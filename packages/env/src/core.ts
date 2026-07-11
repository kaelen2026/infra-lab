// Core environment: the Postgres / Redis / Better-Auth secrets shared by the API,
// the db tooling and the verify scripts. This is the single source of truth for
// that bucket — schema, defaults and validation live here so a missing or malformed
// value fails fast at boot with a named error, instead of surfacing on some later
// request path.
//
// Deliberately fail-fast (unlike the bot bucket, which degrades gracefully):
// the API cannot serve without a database, a redis and a signing secret.
//
// NEVER log a parsed value — zod issue messages carry the var name and constraint,
// never the input, so throwing `error.issues` is safe. Do not add value echoing.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

// Treat an empty string the same as unset, so `KEY=` in a .env falls back to the
// default / cross-field default instead of being used as a literal empty value.
const optionalNonEmpty = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.string().min(1).optional(),
);

// "true" (and only "true") is truthy, matching the prior hand-rolled `=== "true"`.
const envFlag = z.preprocess((v) => v === "true", z.boolean());

const CoreEnvSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    // Postgres pool ceiling **per process** (postgres-js `max`). N API replicas hold
    // up to N × DATABASE_POOL_MAX connections — size it so that product stays under
    // the database's connection limit (see docs/deployment.md for the arithmetic;
    // Neon free tier and small instances cap out fast).
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    // Escape hatch for the TLS guardrail below: opt out of requiring an encrypted
    // DSN in production when Postgres is reached over a genuinely private network
    // (e.g. the deploy compose's internal bridge). Never set this for a database
    // that traverses a network you don't own.
    DATABASE_ALLOW_PLAINTEXT: envFlag.default(false),
    REDIS_URL: z.string().min(1),
    OTP_SECRET: z.string().min(1),
    // Falls back to OTP_SECRET when unset (see the object-level transform below).
    BETTER_AUTH_SECRET: optionalNonEmpty,
    BETTER_AUTH_URL: optionalNonEmpty.pipe(z.string().default("http://localhost:3000")),
    // Extra browser origins allowed to call the API cross-origin (comma-separated), on
    // top of BETTER_AUTH_URL. Needed because h5 (a separate browser client reusing web's
    // cookie transport) runs on its own origin. Defaults to the h5 dev origin so `pnpm dev`
    // works out of the box; set explicitly in production. Combined + deduped in the
    // transform below into the TRUSTED_ORIGINS allowlist.
    TRUSTED_ORIGINS: optionalNonEmpty.pipe(z.string().default("http://localhost:3002")),
    COOKIE_SECURE: envFlag.default(false),
    COOKIE_DOMAIN: optionalNonEmpty,
    OTP_DEBUG_RETURN_CODE: envFlag.default(false),
    PORT: z.coerce.number().int().positive().default(3001),
    NODE_ENV: optionalNonEmpty,
    // Number of trusted reverse proxies that append X-Forwarded-For in front of the
    // API. The real client IP is read `TRUSTED_PROXY_COUNT` entries from the right of
    // the XFF list (see `clientIp` in auth.routes.ts). Default 0 = XFF is untrusted,
    // so a directly-reachable API cannot be spoofed into trusting a client-set header.
    TRUSTED_PROXY_COUNT: z.coerce.number().int().min(0).default(0),
    // Local directory where timeline image uploads are written (first-cut storage;
    // swap for object storage later). Relative paths resolve against the API's cwd
    // (apps/api). Served back read-only from GET /uploads/:name.
    UPLOADS_DIR: optionalNonEmpty.pipe(z.string().default(".uploads")),
    // ── APNS (Apple Push Notification service), all optional ──────────────────────
    // Token-based (.p8) provider auth for pushing to the iOS client. All five are
    // optional so the API boots without push configured (`apnsConfigFromEnv` returns
    // null → push is simply disabled). When ANY is set, the superRefine below requires
    // the full set, so a half-configured provider fails fast instead of at send time.
    // APNS_PRIVATE_KEY holds the .p8 PEM inline (\n-escaped); APNS_PRIVATE_KEY_PATH
    // points at the file instead. Never logged. See services/apns-client.ts.
    APNS_KEY_ID: optionalNonEmpty,
    APNS_TEAM_ID: optionalNonEmpty,
    APNS_BUNDLE_ID: optionalNonEmpty,
    APNS_PRIVATE_KEY: optionalNonEmpty,
    APNS_PRIVATE_KEY_PATH: optionalNonEmpty,
    // Which APNS host to hit: true → api.push.apple.com, false (default) → sandbox.
    APNS_PRODUCTION: envFlag.default(false),
    // ── Google sign-in (OAuth / OIDC), all optional ──────────────────────────────
    // Enables the Google login entry point (web redirect + native ID-token flows).
    // Both optional so the API boots without Google configured (`googleConfigFromEnv`
    // returns null → the provider is simply disabled and its routes answer
    // SOCIAL_PROVIDER_DISABLED). When ONE is set the superRefine below requires the
    // other, so a half-configured provider fails fast at boot instead of at sign-in.
    // GOOGLE_CLIENT_SECRET is only needed for the web redirect (authorization-code)
    // flow; the native ID-token flow verifies against the client id (audience) alone.
    // Never logged. See packages/auth/src/better-auth.ts + routes/social.routes.ts.
    GOOGLE_CLIENT_ID: optionalNonEmpty,
    GOOGLE_CLIENT_SECRET: optionalNonEmpty,
    // ── Apple sign-in (Sign in with Apple), native-only for now ───────────────────
    // Enables the Apple login entry point for the native ID-token flow (iOS today).
    // Single, optional var: the on-device idToken's `aud` is the app bundle id, so we
    // verify against it (Better Auth `appBundleIdentifier`). Unlike Google there is no
    // both-or-neither pair — the web authorization-code flow (Services ID + `.p8`
    // client secret) is deferred, so no APPLE_CLIENT_SECRET is needed yet. Set this to
    // the iOS bundle id (dev.w3ctech.infralab). Unset → Apple disabled, its route
    // answers SOCIAL_PROVIDER_DISABLED. See packages/auth/src/better-auth.ts.
    APPLE_CLIENT_ID: optionalNonEmpty,
    // ── Resend (transactional email, for the email-OTP channel), all optional ─────
    // Enables delivering OTP codes over email via Resend's HTTP API. Both optional so
    // the API boots without email configured (`resendConfigFromEnv` returns null → the
    // email-OTP endpoints fall back to the same dev log stub as the SMS channel, so the
    // flow still works locally and only real delivery is skipped). When ONE is set the
    // superRefine below requires the other, so a half-configured provider fails fast at
    // boot instead of silently dropping every email. RESEND_FROM is the verified sender
    // ("Name <no-reply@your-domain>"). RESEND_API_KEY is never logged.
    RESEND_API_KEY: optionalNonEmpty,
    RESEND_FROM: optionalNonEmpty,
    // Global request-body ceiling (bytes). A body larger than this is rejected with a
    // 413 before the handler runs, bounding the memory one request can force the API to
    // buffer. Must stay above the largest legitimate body — a timeline image upload
    // (TIMELINE_IMAGE_MAX_BYTES = 8 MiB) plus multipart framing — so the default leaves
    // headroom; the per-route image check still enforces the exact image limit.
    MAX_REQUEST_BODY_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(10 * 1024 * 1024),
    // A successful request slower than this many ms is logged at `warn` with `slow: true`
    // instead of `info`, so latency regressions surface in the access log without a
    // metrics backend. 0 disables the escalation. Errors/4xx keep their own levels.
    SLOW_REQUEST_MS: z.coerce.number().int().min(0).default(1000),
    // Coarse per-client request throttle (transport-level guardrail). A fixed window of
    // RATE_LIMIT_WINDOW_SECONDS allows at most RATE_LIMIT_MAX requests per client IP,
    // applied to every endpoint except the health probes. Complements the fine-grained
    // per-phone / per-IP OTP quotas, which still apply on top. Uses the same trusted
    // client-IP resolution as OTP (see TRUSTED_PROXY_COUNT) — set that correctly behind
    // a proxy or the bucket collapses to one global counter. RATE_LIMIT_MAX=0 disables it.
    RATE_LIMIT_MAX: z.coerce.number().int().min(0).default(120),
    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    // Graceful-shutdown ceiling (ms). On SIGTERM/SIGINT the server drains in-flight
    // requests; if the drain hasn't finished within this window (e.g. one hung
    // request), the process force-exits(1) instead of hanging until the
    // orchestrator's SIGKILL. Keep it under the orchestrator's kill grace period
    // (K8s terminationGracePeriodSeconds defaults to 30s; Compose stop_grace_period 10s).
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  })
  .superRefine((e, ctx) => {
    // Hard production guardrail: OTP_DEBUG_RETURN_CODE echoes the code into responses
    // and logs, violating the "never log OTP" red line. Refuse to boot rather than
    // rely on convention if it is ever left on in production.
    if (e.NODE_ENV === "production" && e.OTP_DEBUG_RETURN_CODE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OTP_DEBUG_RETURN_CODE"],
        message: "must not be enabled when NODE_ENV=production (would leak OTP codes)",
      });
    }
    // M1 — transport guardrail: a 30-day session cookie sent without `Secure` can be
    // captured over a plaintext hop and replayed (session hijack). COOKIE_SECURE
    // defaults to false for local dev, so refuse to boot in production unless it is
    // explicitly enabled, rather than silently downgrade cookie security.
    if (e.NODE_ENV === "production" && e.COOKIE_SECURE !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["COOKIE_SECURE"],
        message: "must be true when NODE_ENV=production (session cookies require Secure)",
      });
    }
    // TLS guardrail: production traffic to the database must be encrypted. TLS used
    // to rest entirely on the operator remembering `?sslmode=require` in the DSN —
    // a plaintext production DSN was accepted silently. Refuse to boot unless the
    // DSN pins an encrypting sslmode (require / verify-ca / verify-full — weaker
    // modes like `prefer` can silently downgrade) or ssl=true, or the operator
    // explicitly declares the link private via DATABASE_ALLOW_PLAINTEXT.
    if (
      e.NODE_ENV === "production" &&
      !e.DATABASE_ALLOW_PLAINTEXT &&
      !/[?&](?:sslmode=(?:require|verify-ca|verify-full)|ssl=true)(?:&|$)/.test(e.DATABASE_URL)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message:
          "must require TLS when NODE_ENV=production (add ?sslmode=require to the DSN, or set DATABASE_ALLOW_PLAINTEXT=true only for a private-network database)",
      });
    }
    // L1 — per-IP rate-limit guardrail: with TRUSTED_PROXY_COUNT === 0 the client IP
    // falls back to a constant (`0.0.0.0` in `clientIp`), collapsing the per-IP OTP
    // quota into one global bucket shared by every caller — both unenforceable per
    // attacker and self-DoS-able by normal traffic. A direct-connect API cannot read
    // the real client IP from headers at all (even `x-real-ip` is proxy-injected), so
    // refuse to boot in production unless the operator declares the real trusted-proxy
    // hop count, rather than silently degrade the per-IP defence.
    if (e.NODE_ENV === "production" && e.TRUSTED_PROXY_COUNT === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TRUSTED_PROXY_COUNT"],
        message:
          "must be > 0 when NODE_ENV=production (declare the trusted-proxy hop count so per-IP rate limiting is not degraded to a single global bucket)",
      });
    }
    // L4 — key separation: in production the Better-Auth / JWT signing secret must be
    // set explicitly and must NOT reuse OTP_SECRET, so one leaked secret can't
    // compromise OTP hashing AND session signing. Non-prod keeps the dev fallback
    // below (BETTER_AUTH_SECRET ?? OTP_SECRET). Never echo the secret value here.
    if (e.NODE_ENV === "production") {
      if (e.BETTER_AUTH_SECRET === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["BETTER_AUTH_SECRET"],
          message: "must be set explicitly when NODE_ENV=production (do not reuse OTP_SECRET)",
        });
      } else if (e.BETTER_AUTH_SECRET === e.OTP_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["BETTER_AUTH_SECRET"],
          message: "must differ from OTP_SECRET when NODE_ENV=production (key separation)",
        });
      }
    }
    // APNS all-or-nothing: push is opt-in (all unset ⇒ disabled), but a partial config
    // is a deployment mistake — one missing var means every send fails with a confusing
    // 4xx from Apple. Require the full set as soon as any APNS var is present, and
    // require exactly one private-key source (inline OR path, not both/neither).
    const apnsFields = [e.APNS_KEY_ID, e.APNS_TEAM_ID, e.APNS_BUNDLE_ID];
    const apnsKeySources = [e.APNS_PRIVATE_KEY, e.APNS_PRIVATE_KEY_PATH];
    const apnsTouched = [...apnsFields, ...apnsKeySources].some((v) => v !== undefined);
    if (apnsTouched) {
      if (e.APNS_KEY_ID === undefined)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["APNS_KEY_ID"],
          message: "required when any APNS_* is set",
        });
      if (e.APNS_TEAM_ID === undefined)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["APNS_TEAM_ID"],
          message: "required when any APNS_* is set",
        });
      if (e.APNS_BUNDLE_ID === undefined)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["APNS_BUNDLE_ID"],
          message: "required when any APNS_* is set",
        });
      if (apnsKeySources.filter((v) => v !== undefined).length !== 1)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["APNS_PRIVATE_KEY"],
          message:
            "set exactly one of APNS_PRIVATE_KEY (inline .p8) or APNS_PRIVATE_KEY_PATH (file)",
        });
    }
    // Google sign-in both-or-neither: the web redirect flow needs BOTH the client id
    // and secret, so a half-set pair is a deployment mistake — the id alone would let
    // the native ID-token flow work while the web flow fails only at the callback. Fail
    // fast at boot instead. All-unset simply leaves Google disabled.
    if ((e.GOOGLE_CLIENT_ID === undefined) !== (e.GOOGLE_CLIENT_SECRET === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [e.GOOGLE_CLIENT_ID === undefined ? "GOOGLE_CLIENT_ID" : "GOOGLE_CLIENT_SECRET"],
        message: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together (or both unset)",
      });
    }
    // Resend both-or-neither: the API key and the verified `from` address are both
    // required to send. A half-set pair is a deployment mistake — every email would
    // fail (missing key) or be rejected by Resend (missing/unverified from). Fail fast
    // at boot. All-unset simply leaves email delivery on the dev log stub.
    if ((e.RESEND_API_KEY === undefined) !== (e.RESEND_FROM === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [e.RESEND_API_KEY === undefined ? "RESEND_API_KEY" : "RESEND_FROM"],
        message: "RESEND_API_KEY and RESEND_FROM must be set together (or both unset)",
      });
    }
  })
  .transform((e) => {
    // Allowlist for both hono CORS and Better Auth: BETTER_AUTH_URL (the web/auth origin,
    // always trusted) plus the comma-separated TRUSTED_ORIGINS extras, trimmed + deduped.
    const extras = e.TRUSTED_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    return {
      ...e,
      BETTER_AUTH_SECRET: e.BETTER_AUTH_SECRET ?? e.OTP_SECRET,
      TRUSTED_ORIGINS: [...new Set([e.BETTER_AUTH_URL, ...extras])],
    };
  });

export type CoreEnv = z.infer<typeof CoreEnvSchema>;

/**
 * Validate a raw env bag into a typed {@link CoreEnv}. Pure and side-effect free —
 * unit tests drive this directly with fixtures; {@link loadCoreEnv} wires it to the
 * process environment.
 * @throws if any variable is missing or malformed, with all issues in one message.
 */
export function parseCoreEnv(source: Record<string, string | undefined>): CoreEnv {
  const parsed = CoreEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid core environment variables:\n${issues}`);
  }
  return parsed.data;
}

// The API runs from apps/api, so the repo .env sits two levels up. In production the
// platform injects real env vars and no file is present — loading is then a no-op.
// Existing process.env values are not overwritten by an absent file.
function loadRootEnvFile(): void {
  for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
  }
}

/** Fully-resolved APNS provider credentials (private key already loaded to PEM). */
export interface ApnsEnvConfig {
  keyId: string;
  teamId: string;
  bundleId: string;
  /** .p8 private key PEM contents. Never logged. */
  privateKey: string;
  /** true → api.push.apple.com; false → api.sandbox.push.apple.com. */
  production: boolean;
}

/** Resolve the .p8 private key from the inline var (\n-escaped) or the file path. */
function resolveApnsPrivateKey(env: CoreEnv): string | undefined {
  const inline = env.APNS_PRIVATE_KEY;
  if (inline) return inline.includes("\\n") ? inline.replace(/\\n/g, "\n") : inline;
  const path = env.APNS_PRIVATE_KEY_PATH;
  if (path) return readFileSync(path, "utf8");
  return undefined;
}

/**
 * Build APNS provider config from validated env, or `null` when push is not
 * configured (no APNS_* set). The schema's superRefine guarantees that a non-null
 * result has every field present, so callers get all-or-nothing.
 */
export function apnsConfigFromEnv(env: CoreEnv): ApnsEnvConfig | null {
  if (!env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_BUNDLE_ID) return null;
  const privateKey = resolveApnsPrivateKey(env);
  if (!privateKey) return null;
  return {
    keyId: env.APNS_KEY_ID,
    teamId: env.APNS_TEAM_ID,
    bundleId: env.APNS_BUNDLE_ID,
    privateKey,
    production: env.APNS_PRODUCTION,
  };
}

/** Resolved Google OAuth credentials. */
export interface GoogleEnvConfig {
  clientId: string;
  /** Never logged. Required for the web authorization-code flow. */
  clientSecret: string;
}

/**
 * Build Google sign-in config from validated env, or `null` when it is not
 * configured (neither var set). The schema's superRefine guarantees a non-null
 * result has both fields present (both-or-neither), so callers get all-or-nothing.
 */
export function googleConfigFromEnv(env: CoreEnv): GoogleEnvConfig | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

export interface AppleEnvConfig {
  /**
   * The audience the native ID token is verified against — the iOS app bundle id
   * (`dev.w3ctech.infralab`). Passed to Better Auth as both `clientId` and
   * `appBundleIdentifier`; the on-device Sign in with Apple idToken carries this
   * bundle id in its `aud`, not a Services ID. Never logged.
   */
  clientId: string;
}

/**
 * Build Apple sign-in config from validated env, or `null` when it is not
 * configured (`APPLE_CLIENT_ID` unset → the provider is simply disabled). Native
 * ID-token verification needs only the audience, so there is no secret to pair.
 */
export function appleConfigFromEnv(env: CoreEnv): AppleEnvConfig | null {
  if (!env.APPLE_CLIENT_ID) return null;
  return { clientId: env.APPLE_CLIENT_ID };
}

/** Resolved Resend email-delivery credentials. */
export interface ResendEnvConfig {
  /** Resend API key (`re_...`). Never logged. */
  apiKey: string;
  /** Verified sender, e.g. `Infra Lab <no-reply@example.com>`. */
  from: string;
}

/**
 * Build Resend email config from validated env, or `null` when it is not configured
 * (neither var set). The schema's superRefine guarantees a non-null result has both
 * fields present (both-or-neither), so callers get all-or-nothing.
 */
export function resendConfigFromEnv(env: CoreEnv): ResendEnvConfig | null {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) return null;
  return { apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM };
}

let cached: CoreEnv | undefined;

/**
 * Load the repo `.env` (if present) and validate `process.env` into a typed,
 * memoized {@link CoreEnv}. Call once at process start; throws on any bad value.
 */
export function loadCoreEnv(): CoreEnv {
  if (cached) return cached;
  loadRootEnvFile();
  cached = parseCoreEnv(process.env);
  return cached;
}
