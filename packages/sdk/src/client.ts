import {
  ADMIN_ROUTES,
  type AdminAccessResponse,
  type AdminClient,
  type AdminStatsDTO,
  type AdminStatsResponse,
  type AdminUsersResponse,
  type ApproveQrLoginInput,
  type ApproveQrLoginResponse,
  AUTH_ROUTES,
  type AuthClient,
  type AuthErrorCode,
  type AuthTokens,
  type AuthUser,
  type ConsumeQrLoginInput,
  type ConsumeQrLoginResponse,
  type CreateQrLoginResponse,
  type CreateTimelinePostInput,
  type CreateTodoInput,
  type DeviceDTO,
  type DevicesResponse,
  type ListAdminUsersInput,
  type ListTimelineOptions,
  type LoginEventDTO,
  type LoginEventsResponse,
  type Platform,
  type ProfileResponse,
  QR_POLL_TOKEN_HEADER,
  type QrLoginClient,
  type QrLoginStatus,
  type QrLoginStatusQuery,
  type QrLoginStatusResponse,
  type RefreshInput,
  type RequestOtpInput,
  type RequestOtpResponse,
  TIMELINE_ROUTES,
  type TimelineClient,
  type TimelineImageContentType,
  type TimelineImageDTO,
  type TimelineImageResponse,
  type TimelinePage,
  type TimelinePostDTO,
  type TimelinePostResponse,
  type TimelinePostsResponse,
  TODO_ROUTES,
  type TodoClient,
  type TodoDTO,
  type TodoResponse,
  type TodosResponse,
  timelinePostPath,
  timelineSharePath,
  todoPath,
  type UpdateProfileInput,
  type UpdateTodoInput,
  type UserRole,
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

  /** Bearer header for native; web relies on the session cookie instead. */
  async function authHeaders(): Promise<Record<string, string>> {
    if (isWeb) return {};
    const t = await store.load();
    return t ? { authorization: `${t.tokenType} ${t.accessToken}` } : {};
  }

  async function request<T>(path: string, body?: unknown, method?: string): Promise<T> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(await authHeaders()),
    };
    const res = await doFetch(`${options.baseUrl}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
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

    async updateProfile(input: UpdateProfileInput): Promise<AuthUser> {
      const res = await request<ProfileResponse>(AUTH_ROUTES.updateProfile, input, "PATCH");
      return res.user;
    },

    async uploadAvatar(
      bytes: Uint8Array,
      contentType: TimelineImageContentType,
    ): Promise<AuthUser> {
      // multipart body: let fetch set the boundary — don't hand-set content-type.
      // Copy into a fresh ArrayBuffer so the Blob part is a plain ArrayBuffer
      // (a Uint8Array over ArrayBufferLike isn't assignable to BlobPart).
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      const form = new FormData();
      form.append("file", new Blob([buffer], { type: contentType }), "avatar");
      const res = await doFetch(`${options.baseUrl}${AUTH_ROUTES.avatar}`, {
        method: "POST",
        headers: await authHeaders(),
        credentials: isWeb ? "include" : "omit",
        body: form,
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok) throw new HttpAuthError(res.status, json);
      return (json as ProfileResponse).user;
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

export interface CreateQrLoginClientOptions {
  baseUrl: string;
  platform: Platform;
  /** Defaults to a no-op store (web). Native platforms supply a secure store. */
  tokens?: TokenStore;
  fetch?: typeof fetch;
}

/**
 * Reference {@link QrLoginClient}. Same transport model as {@link createAuthClient}:
 * web rides the HttpOnly cookie (`credentials: "include"`), native sends the Bearer
 * header from the supplied {@link TokenStore}. The browser uses `create`/`status`/
 * `consume`; a logged-in native app uses `approve`. Non-2xx responses throw
 * {@link HttpAuthError}, whose `code` carries the `QR_*` error codes.
 */
export function createQrLoginClient(options: CreateQrLoginClientOptions): QrLoginClient {
  const doFetch = options.fetch ?? globalThis.fetch;
  const store = options.tokens ?? noopTokenStore;
  const isWeb = options.platform === "web";

  async function request<T>(
    path: string,
    method: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json", ...extraHeaders };
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
    create(): Promise<CreateQrLoginResponse> {
      return request<CreateQrLoginResponse>(AUTH_ROUTES.qrCreate, "POST", {});
    },

    async status(input: QrLoginStatusQuery): Promise<QrLoginStatus> {
      // The secret pollToken rides a header, never the query string — a GET query
      // is recorded by proxies / browser history (issue #129 L1).
      const query = new URLSearchParams({ ticketId: input.ticketId });
      const res = await request<QrLoginStatusResponse>(
        `${AUTH_ROUTES.qrStatus}?${query.toString()}`,
        "GET",
        undefined,
        { [QR_POLL_TOKEN_HEADER]: input.pollToken },
      );
      return res.status;
    },

    async approve(input: ApproveQrLoginInput): Promise<void> {
      await request<ApproveQrLoginResponse>(AUTH_ROUTES.qrApprove, "POST", input);
    },

    async consume(input: ConsumeQrLoginInput): Promise<AuthUser> {
      const res = await request<ConsumeQrLoginResponse>(AUTH_ROUTES.qrConsume, "POST", input);
      return res.user;
    },
  };
}

/**
 * Web-flavored {@link createQrLoginClient}: fixes `platform: "web"` so `consume`'s
 * Set-Cookie lands in the browser (`credentials: "include"`) and no token is stored.
 */
export function createWebQrLoginClient(baseUrl: string, fetchImpl?: typeof fetch): QrLoginClient {
  return createQrLoginClient({ baseUrl, platform: "web", fetch: fetchImpl });
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

export interface CreateTimelineClientOptions {
  baseUrl: string;
  platform: Platform;
  /** Defaults to a no-op store (web). Native platforms supply a secure store. */
  tokens?: TokenStore;
  fetch?: typeof fetch;
}

/**
 * Reference {@link TimelineClient}. Shares the auth transport model: web rides the
 * HttpOnly cookie (`credentials: "include"`), native sends the Bearer header from
 * the supplied {@link TokenStore}. Image upload is a `multipart/form-data` POST
 * (field `file`), matching the two-step publish the API expects; every other call
 * is JSON. Non-2xx responses throw {@link HttpAuthError}, whose `code`/`status`
 * carry the timeline error codes.
 */
export function createTimelineClient(options: CreateTimelineClientOptions): TimelineClient {
  const doFetch = options.fetch ?? globalThis.fetch;
  const store = options.tokens ?? noopTokenStore;
  const isWeb = options.platform === "web";

  /** Bearer header for native; web relies on the session cookie instead. */
  async function authHeaders(): Promise<Record<string, string>> {
    if (isWeb) return {};
    const t = await store.load();
    return t ? { authorization: `${t.tokenType} ${t.accessToken}` } : {};
  }

  async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(await authHeaders()),
    };
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
    async list(listOptions?: ListTimelineOptions): Promise<TimelinePage> {
      const query = new URLSearchParams();
      if (listOptions?.cursor !== undefined) query.set("cursor", listOptions.cursor);
      if (listOptions?.limit !== undefined) query.set("limit", String(listOptions.limit));
      const qs = query.toString();
      const path = qs ? `${TIMELINE_ROUTES.list}?${qs}` : TIMELINE_ROUTES.list;
      const res = await request<TimelinePostsResponse>(path, "GET");
      return { posts: res.posts, nextCursor: res.nextCursor };
    },

    async uploadImage(
      bytes: Uint8Array,
      contentType: TimelineImageContentType,
    ): Promise<TimelineImageDTO> {
      // multipart body: let fetch set the boundary — don't hand-set content-type.
      // Copy into a fresh ArrayBuffer so the Blob part is a plain ArrayBuffer
      // (a Uint8Array over ArrayBufferLike isn't assignable to BlobPart).
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      const form = new FormData();
      form.append("file", new Blob([buffer], { type: contentType }), "upload");
      const res = await doFetch(`${options.baseUrl}${TIMELINE_ROUTES.uploadImage}`, {
        method: "POST",
        headers: await authHeaders(),
        credentials: isWeb ? "include" : "omit",
        body: form,
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok) throw new HttpAuthError(res.status, json);
      return (json as TimelineImageResponse).image;
    },

    async create(input: CreateTimelinePostInput): Promise<TimelinePostDTO> {
      const res = await request<TimelinePostResponse>(TIMELINE_ROUTES.create, "POST", input);
      return res.post;
    },

    async remove(id: string): Promise<void> {
      await request<{ ok: true }>(timelinePostPath(id), "DELETE");
    },

    async getShared(id: string): Promise<TimelinePostDTO> {
      // Public endpoint: no auth needed, but riding the shared transport is
      // harmless (the cookie/bearer is simply ignored server-side).
      const res = await request<TimelinePostResponse>(timelineSharePath(id), "GET");
      return res.post;
    },
  };
}

/**
 * Web-flavored {@link createTimelineClient}: fixes `platform: "web"` so requests
 * carry the HttpOnly `infra.session` cookie and no token is stored in the browser.
 */
export function createWebTimelineClient(baseUrl: string, fetchImpl?: typeof fetch): TimelineClient {
  return createTimelineClient({ baseUrl, platform: "web", fetch: fetchImpl });
}

export interface CreateAdminClientOptions {
  baseUrl: string;
  platform: Platform;
  /** Defaults to a no-op store (web). Native platforms supply a secure store. */
  tokens?: TokenStore;
  fetch?: typeof fetch;
}

/**
 * Reference {@link AdminClient} — the web management console. Shares the auth
 * transport model (web rides the HttpOnly cookie; native would send Bearer, but
 * the console is web-only). Non-2xx responses throw {@link HttpAuthError}, whose
 * `code` carries the admin error codes (`FORBIDDEN` → 403 for a non-admin).
 */
export function createAdminClient(options: CreateAdminClientOptions): AdminClient {
  const doFetch = options.fetch ?? globalThis.fetch;
  const store = options.tokens ?? noopTokenStore;
  const isWeb = options.platform === "web";

  async function request<T>(path: string): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (!isWeb) {
      const t = await store.load();
      if (t) headers.authorization = `${t.tokenType} ${t.accessToken}`;
    }
    const res = await doFetch(`${options.baseUrl}${path}`, {
      method: "GET",
      headers,
      credentials: isWeb ? "include" : "omit",
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpAuthError(res.status, json);
    return json as T;
  }

  return {
    async access(): Promise<{ role: UserRole; isAdmin: boolean }> {
      const res = await request<AdminAccessResponse>(ADMIN_ROUTES.access);
      return { role: res.role, isAdmin: res.isAdmin };
    },

    async stats(): Promise<AdminStatsDTO> {
      const res = await request<AdminStatsResponse>(ADMIN_ROUTES.stats);
      return res.stats;
    },

    async listUsers(input?: Partial<ListAdminUsersInput>): Promise<AdminUsersResponse> {
      const query = new URLSearchParams();
      if (input?.limit !== undefined) query.set("limit", String(input.limit));
      if (input?.offset !== undefined) query.set("offset", String(input.offset));
      const qs = query.toString();
      const path = qs ? `${ADMIN_ROUTES.users}?${qs}` : ADMIN_ROUTES.users;
      return request<AdminUsersResponse>(path);
    },
  };
}

/**
 * Web-flavored {@link createAdminClient}: fixes `platform: "web"` so requests carry
 * the HttpOnly `infra.session` cookie and no token is stored in the browser.
 */
export function createWebAdminClient(baseUrl: string, fetchImpl?: typeof fetch): AdminClient {
  return createAdminClient({ baseUrl, platform: "web", fetch: fetchImpl });
}
