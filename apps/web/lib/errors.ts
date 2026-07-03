import { COPY } from "@infra/design";
import { HttpAuthError } from "@infra/sdk";

/**
 * Map any thrown error from an SDK client to a display string. Copy comes from the
 * canonical `@infra/design` source (the same wording every client shows), so the web
 * app no longer hand-copies error strings. Network / unknown failures collapse to a
 * generic message; {@link HttpAuthError} carries a stable `code` (and, for wrong OTP
 * codes, the remaining-attempts hint).
 *
 * `fallback` is used when the error carries no code we recognise — feature hooks pass
 * an action-specific line (e.g. "创建失败，请重试。") so a known server code (LOCKED,
 * UNAUTHORIZED, …) still shows its precise copy while everything else stays friendly.
 */
export function describeError(err: unknown, fallback: string = COPY.errors.generic): string {
  if (!(err instanceof HttpAuthError)) return COPY.errors.network;
  const base = COPY.errors.messages[err.code] ?? fallback;
  if (err.code === "INVALID_CODE" && typeof err.remainingAttempts === "number") {
    return COPY.errors.invalidCodeRemaining
      .replace("{base}", base)
      .replace("{remaining}", String(err.remainingAttempts));
  }
  return base;
}
