/**
 * Centralized, validated web runtime config — the ONLY place `process.env` is read.
 *
 * `NEXT_PUBLIC_*` vars are inlined at build time, so this runs on both server and
 * client. We validate the API base once and strip any trailing slash so callers can
 * always build urls as `${apiBaseUrl}${path}` (paths start with `/`) without doubling
 * up. An empty var falls back to the local API; a malformed one fails fast at import
 * so a bad deploy surfaces immediately instead of as scattered fetch errors.
 */

const DEFAULT_API_BASE_URL = "http://localhost:3001";

function resolveApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) return DEFAULT_API_BASE_URL;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid NEXT_PUBLIC_API_URL: ${raw} is not a valid URL`);
  }
  // Drop a trailing slash so `${apiBaseUrl}${path}` never produces a double slash.
  return parsed.toString().replace(/\/$/, "");
}

/** Validated web runtime configuration. Import this instead of reading env vars. */
export const env = {
  apiBaseUrl: resolveApiBaseUrl(),
} as const;
