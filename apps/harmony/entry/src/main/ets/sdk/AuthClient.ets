import { http } from "@kit.NetworkKit";
import {
  AUTH_ROUTES,
  AuthErrorBody,
  AuthErrorCode,
  AuthTokens,
  AuthUser,
  DeviceDTO,
  DevicesResponse,
  LoginEventDTO,
  LoginEventsResponse,
  MeResponse,
  Platform,
  RefreshResponse,
  RequestOtpInput,
  RequestOtpResponse,
  VerifyOtpInput,
  VerifyOtpResponse,
} from "../common/contracts";

/**
 * Pluggable secure token storage. HarmonyOS backs this with HUKS-encrypted
 * Preferences ({@link HuksTokenStore}); tests can inject an in-memory fake.
 */
export interface TokenStore {
  load(): Promise<AuthTokens | null>;
  save(tokens: AuthTokens): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Thrown when the API responds non-2xx. Mirrors the shared `HttpAuthError`: callers
 * branch on a stable {@link AuthErrorCode} and surface retry/lockout hints.
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

/** Request body for POST /auth/refresh. */
interface RefreshRequestBody {
  refreshToken: string;
}

/** A body-less POST (e.g. logout). ArkTS requires every object literal to have a named type. */
interface EmptyBody {}

type RequestBody = RequestOtpInput | VerifyOtpInput | RefreshRequestBody | EmptyBody;

/** The shape every platform SDK implements (mirrors the shared AuthClient). */
export interface AuthClient {
  requestOtp(input: RequestOtpInput): Promise<RequestOtpResponse>;
  verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResponse>;
  refresh(): Promise<AuthTokens | null>;
  me(): Promise<AuthUser>;
  /** Registered client installs for the current user (account dashboard). */
  listDevices(): Promise<DeviceDTO[]>;
  /** Recent OTP verification attempts for the current user (account dashboard). */
  listLoginEvents(): Promise<LoginEventDTO[]>;
  logout(): Promise<void>;
}

/**
 * HarmonyOS {@link AuthClient}: `@ohos.net.http` transport + Bearer auth from a
 * {@link TokenStore}. Tokens land in the store on verify/refresh and are cleared on
 * logout. Non-2xx responses throw {@link HttpAuthError}; transport failures bubble
 * up as the underlying `BusinessError` from `@kit.BasicServicesKit`.
 */
export class HarmonyAuthClient implements AuthClient {
  private readonly baseUrl: string;
  private readonly store: TokenStore;
  private readonly platform: Platform;

  constructor(baseUrl: string, store: TokenStore, platform: Platform = "harmony") {
    this.baseUrl = baseUrl;
    this.store = store;
    this.platform = platform;
  }

  private async request<T>(path: string, body?: RequestBody, auth: boolean = false): Promise<T> {
    const header: Record<string, string> = { "Content-Type": "application/json" };
    if (auth) {
      const tokens: AuthTokens | null = await this.store.load();
      if (tokens !== null) {
        header["Authorization"] = `${tokens.tokenType} ${tokens.accessToken}`;
      }
    }

    const request: http.HttpRequest = http.createHttp();
    try {
      const options: http.HttpRequestOptions = {
        method: body === undefined ? http.RequestMethod.GET : http.RequestMethod.POST,
        header: header,
        expectDataType: http.HttpDataType.STRING,
        extraData: body === undefined ? undefined : JSON.stringify(body),
      };
      const response: http.HttpResponse = await request.request(`${this.baseUrl}${path}`, options);
      const status: number = response.responseCode;
      const text: string = (response.result as string) ?? "";
      const json: object = text.length > 0 ? (JSON.parse(text) as object) : (JSON.parse("{}") as object);
      if (status < 200 || status >= 300) {
        throw new HttpAuthError(status, json as AuthErrorBody);
      }
      return json as T;
    } finally {
      request.destroy();
    }
  }

  requestOtp(input: RequestOtpInput): Promise<RequestOtpResponse> {
    return this.request<RequestOtpResponse>(AUTH_ROUTES.requestOtp, input);
  }

  async verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResponse> {
    const res: VerifyOtpResponse = await this.request<VerifyOtpResponse>(
      AUTH_ROUTES.verifyOtp,
      input,
    );
    if (res.tokens !== undefined) {
      await this.store.save(res.tokens);
    }
    return res;
  }

  async refresh(): Promise<AuthTokens | null> {
    const current: AuthTokens | null = await this.store.load();
    if (current === null) {
      return null;
    }
    const body: RefreshRequestBody = { refreshToken: current.refreshToken };
    const res: RefreshResponse = await this.request<RefreshResponse>(AUTH_ROUTES.refresh, body);
    await this.store.save(res.tokens);
    return res.tokens;
  }

  async me(): Promise<AuthUser> {
    const res: MeResponse = await this.request<MeResponse>(AUTH_ROUTES.me, undefined, true);
    return res.user;
  }

  async listDevices(): Promise<DeviceDTO[]> {
    const res: DevicesResponse = await this.request<DevicesResponse>(
      AUTH_ROUTES.devices,
      undefined,
      true,
    );
    return res.devices;
  }

  async listLoginEvents(): Promise<LoginEventDTO[]> {
    const res: LoginEventsResponse = await this.request<LoginEventsResponse>(
      AUTH_ROUTES.loginEvents,
      undefined,
      true,
    );
    return res.events;
  }

  async logout(): Promise<void> {
    const body: EmptyBody = {};
    try {
      await this.request<object>(AUTH_ROUTES.logout, body, true);
    } finally {
      await this.store.clear();
    }
  }
}
