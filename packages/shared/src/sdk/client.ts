import {
  AUTH_ROUTES,
  type AuthClient,
  type AuthTokens,
  type AuthUser,
  type Platform,
  type RefreshInput,
  type RequestOtpInput,
  type RequestOtpResponse,
  type VerifyOtpInput,
  type VerifyOtpResponse,
} from "../contracts/auth";

/**
 * Pluggable token storage. Web passes a no-op store (the HttpOnly cookie holds
 * the session); native platforms back this with Keychain / Keystore / HUKS.
 */
export interface TokenStore {
  load(): Promise<AuthTokens | null> | AuthTokens | null;
  save(tokens: AuthTokens): Promise<void> | void;
  clear(): Promise<void> | void;
}

export const noopTokenStore: TokenStore = {
  load: () => null,
  save: () => {},
  clear: () => {},
};

export interface CreateAuthClientOptions {
  baseUrl: string;
  platform: Platform;
  /** Defaults to a no-op store (web). Native platforms supply a secure store. */
  tokens?: TokenStore;
  fetch?: typeof fetch;
}

class HttpAuthError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`auth request failed: ${code} (${status})`);
    this.name = "HttpAuthError";
  }
}

/**
 * Reference {@link AuthClient}. Web uses cookies (`credentials: "include"`);
 * native uses the Bearer header from the supplied {@link TokenStore}.
 */
export function createAuthClient(options: CreateAuthClientOptions): AuthClient {
  const doFetch = options.fetch ?? globalThis.fetch;
  const store = options.tokens ?? noopTokenStore;
  const isWeb = options.platform === "web";

  async function request<T>(path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (!isWeb) {
      const t = await store.load();
      if (t) headers.authorization = `${t.tokenType} ${t.accessToken}`;
    }
    const res = await doFetch(`${options.baseUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      credentials: isWeb ? "include" : "omit",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = (json as { code?: string }).code ?? "INVALID_REQUEST";
      throw new HttpAuthError(code, res.status, json);
    }
    return json as T;
  }

  return {
    requestOtp(input: RequestOtpInput): Promise<RequestOtpResponse> {
      return request<RequestOtpResponse>(AUTH_ROUTES.requestOtp, input);
    },

    async verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResponse> {
      const res = await request<VerifyOtpResponse>(AUTH_ROUTES.verifyOtp, input);
      if (res.tokens) await store.save(res.tokens);
      return res;
    },

    async refresh(): Promise<AuthTokens | null> {
      if (isWeb) return null; // cookie refresh is server-side
      const current = await store.load();
      if (!current) return null;
      const payload: RefreshInput = { refreshToken: current.refreshToken };
      const res = await request<{ tokens: AuthTokens }>(AUTH_ROUTES.refresh, payload);
      await store.save(res.tokens);
      return res.tokens;
    },

    async me(): Promise<AuthUser> {
      const res = await request<{ user: AuthUser }>(AUTH_ROUTES.me);
      return res.user;
    },

    async logout(): Promise<void> {
      await request<{ ok: true }>(AUTH_ROUTES.logout, {});
      await store.clear();
    },
  };
}
