import {
  AUTH_ROUTES,
  type AuthClient,
  type AuthErrorCode,
  type AuthTokens,
  type AuthUser,
  type CreateTodoInput,
  type DeviceDTO,
  type DevicesResponse,
  type LoginEventDTO,
  type LoginEventsResponse,
  type Platform,
  type RefreshInput,
  type RequestOtpInput,
  type RequestOtpResponse,
  TODO_ROUTES,
  type TodoClient,
  type TodoDTO,
  type TodoResponse,
  type TodosResponse,
  todoPath,
  type UpdateTodoInput,
  type VerifyOtpInput,
  type VerifyOtpResponse,
} from "@infra/shared";

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

/**
 * Thrown when the API responds with a non-2xx status. Mirrors the {@link AuthError}
 * contract so callers can branch on a stable {@link AuthErrorCode} and surface the
 * retry/lockout hints the server returned.
 */
export class HttpAuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  readonly body: unknown;
  /** Seconds until the client may retry (cooldown / lock windows). */
  readonly retryAfter?: number;
  /** Remaining verify attempts before lockout, when applicable. */
  readonly remainingAttempts?: number;

  constructor(status: number, body: unknown) {
    const detail = (body ?? {}) as {
      code?: AuthErrorCode;
      retryAfter?: number;
      remainingAttempts?: number;
    };
    const code = detail.code ?? "INVALID_REQUEST";
    super(`auth request failed: ${code} (${status})`);
    this.name = "HttpAuthError";
    this.code = code;
    this.status = status;
    this.body = body;
    this.retryAfter = detail.retryAfter;
    this.remainingAttempts = detail.remainingAttempts;
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
    if (!res.ok) throw new HttpAuthError(res.status, json);
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

    async listDevices(): Promise<DeviceDTO[]> {
      const res = await request<DevicesResponse>(AUTH_ROUTES.devices);
      return res.devices;
    },

    async listLoginEvents(): Promise<LoginEventDTO[]> {
      const res = await request<LoginEventsResponse>(AUTH_ROUTES.loginEvents);
      return res.events;
    },

    async logout(): Promise<void> {
      await request<{ ok: true }>(AUTH_ROUTES.logout, {});
      await store.clear();
    },
  };
}

/**
 * Web-flavored {@link createAuthClient}: fixes `platform: "web"` so the session
 * rides the HttpOnly `infra.session` cookie (`credentials: "include"`) and no
 * token is ever stored in the browser.
 */
export function createWebAuthClient(baseUrl: string, fetchImpl?: typeof fetch): AuthClient {
  return createAuthClient({ baseUrl, platform: "web", fetch: fetchImpl });
}

export interface CreateTodoClientOptions {
  baseUrl: string;
  platform: Platform;
  /** Defaults to a no-op store (web). Native platforms supply a secure store. */
  tokens?: TokenStore;
  fetch?: typeof fetch;
}

/**
 * Reference {@link TodoClient}. Shares the auth transport model: web rides the
 * HttpOnly cookie (`credentials: "include"`), native sends the Bearer header from
 * the supplied {@link TokenStore}. Non-2xx responses throw {@link HttpAuthError},
 * whose `code`/`status` carry the todo error codes.
 */
export function createTodoClient(options: CreateTodoClientOptions): TodoClient {
  const doFetch = options.fetch ?? globalThis.fetch;
  const store = options.tokens ?? noopTokenStore;
  const isWeb = options.platform === "web";

  async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (!isWeb) {
      const t = await store.load();
      if (t) headers.authorization = `${t.tokenType} ${t.accessToken}`;
    }
    const res = await doFetch(`${options.baseUrl}${path}`, {
      method,
      headers,
      credentials: isWeb ? "include" : "omit",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpAuthError(res.status, json);
    return json as T;
  }

  return {
    async list(): Promise<TodoDTO[]> {
      const res = await request<TodosResponse>(TODO_ROUTES.list, "GET");
      return res.todos;
    },

    async create(input: CreateTodoInput): Promise<TodoDTO> {
      const res = await request<TodoResponse>(TODO_ROUTES.create, "POST", input);
      return res.todo;
    },

    async update(id: string, patch: UpdateTodoInput): Promise<TodoDTO> {
      const res = await request<TodoResponse>(todoPath(id), "PATCH", patch);
      return res.todo;
    },

    toggle(id: string, completed: boolean): Promise<TodoDTO> {
      return this.update(id, { completed });
    },

    async remove(id: string): Promise<void> {
      await request<{ ok: true }>(todoPath(id), "DELETE");
    },
  };
}

/**
 * Web-flavored {@link createTodoClient}: fixes `platform: "web"` so requests carry
 * the HttpOnly `infra.session` cookie and no token is stored in the browser.
 */
export function createWebTodoClient(baseUrl: string, fetchImpl?: typeof fetch): TodoClient {
  return createTodoClient({ baseUrl, platform: "web", fetch: fetchImpl });
}
