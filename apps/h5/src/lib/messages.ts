import { COPY, ERROR_MESSAGES } from "@infra/design";
import { HttpAuthError } from "@infra/sdk";

/**
 * Map any thrown error from the auth/todo SDK to a display string. Copy comes from
 * the canonical `@infra/design` source (same wording every client shows). Network/
 * unknown failures collapse to a generic message; {@link HttpAuthError} carries a
 * stable code (and, for wrong codes, the remaining-attempts hint).
 */
export function describeAuthError(err: unknown): string {
  if (!(err instanceof HttpAuthError)) return COPY.errors.network;
  const base = ERROR_MESSAGES[err.code] ?? COPY.errors.generic;
  if (err.code === "INVALID_CODE" && typeof err.remainingAttempts === "number") {
    return COPY.errors.invalidCodeRemaining
      .replace("{base}", base)
      .replace("{remaining}", String(err.remainingAttempts));
  }
  return base;
}
