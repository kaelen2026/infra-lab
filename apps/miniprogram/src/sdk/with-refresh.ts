import { type AuthClient, HttpAuthError } from "@infra/sdk";

/**
 * Run a protected call, transparently rotating the refresh token once on a 401.
 * Mirrors the CLI's `withRefresh`: the SDK's `refresh()` reads tokens from the
 * store, hits `/auth/refresh`, and saves the rotated pair, so one retry suffices.
 * A refresh that yields nothing (no session / revoked token) rethrows the 401.
 */
export async function withRefresh<T>(auth: AuthClient, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof HttpAuthError && err.status === 401) {
      const rotated = await auth.refresh();
      if (rotated) return await call();
    }
    throw err;
  }
}
