import {
  type AuthClient,
  createAuthClient,
  createTodoClient,
  HttpAuthError,
  type TodoClient,
  type TokenStore,
} from "@infra/sdk";

/** Platform identity the terminal client presents to the API (Bearer transport). */
export const CLI_PLATFORM = "cli" as const;

export interface CliClients {
  auth: AuthClient;
  todo: TodoClient;
}

/**
 * Build the SDK clients for the CLI. `platform: "cli"` means the SDK uses the
 * Bearer transport (`Authorization: <type> <accessToken>`) and reads/writes the
 * supplied {@link TokenStore} — exactly the native flow, just with a file store.
 */
export function createCliClients(opts: {
  apiUrl: string;
  tokens: TokenStore;
  fetch?: typeof fetch;
}): CliClients {
  const shared = { baseUrl: opts.apiUrl, platform: CLI_PLATFORM, tokens: opts.tokens } as const;
  return {
    auth: createAuthClient({ ...shared, fetch: opts.fetch }),
    todo: createTodoClient({ ...shared, fetch: opts.fetch }),
  };
}

/**
 * Run a protected call, transparently rotating the refresh token once if the
 * access token has expired (401 UNAUTHORIZED). The SDK's `refresh()` reads the
 * current tokens from the store, hits `/auth/refresh`, and saves the rotated pair,
 * so a single retry is enough. A refresh that yields nothing (no stored session or
 * a revoked refresh token) rethrows the original 401.
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
