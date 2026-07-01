// Core environment: the Postgres / Redis / Better-Auth secrets shared by the API,
// the db tooling and the verify scripts. This is the single source of truth for
// that bucket — schema, defaults and validation live here so a missing or malformed
// value fails fast at boot with a named error, instead of surfacing on some later
// request path.
//
// Deliberately fail-fast (unlike the feishu bucket, which degrades gracefully):
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
    COOKIE_SECURE: envFlag.default(false),
    COOKIE_DOMAIN: optionalNonEmpty,
    OTP_DEBUG_RETURN_CODE: envFlag.default(false),
    PORT: z.coerce.number().int().positive().default(3001),
  })
  .transform((e) => ({
    ...e,
    BETTER_AUTH_SECRET: e.BETTER_AUTH_SECRET ?? e.OTP_SECRET,
  }));

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
