import { AuthErrorBody, AuthErrorCode } from "../common/contracts";

/**
 * Thrown when the API responds non-2xx. Mirrors the shared `HttpAuthError`: callers
 * branch on a stable {@link AuthErrorCode} and surface retry/lockout hints.
 *
 * Lives in its own module (mirroring iOS `AuthError.swift`) so the refresher's
 * direct rotation can throw it without importing {@link HarmonyAuthClient}.
 */
export class HttpAuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  readonly retryAfter?: number;
  readonly remainingAttempts?: number;

  constructor(status: number, body: AuthErrorBody) {
    const code: AuthErrorCode = body.code ?? "INVALID_REQUEST";
    super(`auth request failed: ${code} (${status})`);
    this.name = "HttpAuthError";
    this.code = code;
    this.status = status;
    this.retryAfter = body.retryAfter;
    this.remainingAttempts = body.remainingAttempts;
  }
}
