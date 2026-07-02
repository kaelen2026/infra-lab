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

import { existsSync } from "node:fs";
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
