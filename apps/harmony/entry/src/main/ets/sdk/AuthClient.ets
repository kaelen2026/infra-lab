import { http } from "@kit.NetworkKit";
import {
  AUTH_ROUTES,
  AuthErrorBody,
  AuthTokens,
  AuthUser,
  DeviceDTO,
  DevicesResponse,
  LoginEventDTO,
  LoginEventsResponse,
  MeResponse,
  Platform,
  RequestOtpInput,
  RequestOtpResponse,
  VerifyOtpInput,
  VerifyOtpResponse,
} from "../common/contracts";
import { HttpAuthError } from "./AuthError";
import { AuthorizedTransport, RawResponse, TransportRequest } from "./AuthorizedTransport";
import { rotateTokens, SessionRefresher } from "./SessionRefresher";
import { TokenStore } from "./TokenStore";

/** A body-less POST (e.g. logout). ArkTS requires every object literal to have a named type. */
interface EmptyBody {}

type RequestBody = RequestOtpInput | VerifyOtpInput | EmptyBody;

/**
 * The token store + shared transport + shared refresher that every authorized client
 * rides. Building it once (see {@link createSession}) and injecting it into both the
 * auth and todo clients is what keeps a `401` on either from rotating the refresh
 * token twice — the single-flight {@link SessionRefresher} is shared.
 */
export interface HarmonySession {
  store: TokenStore;
  transport: AuthorizedTransport;
  refresher: SessionRefresher;
}

/**
 * Wire one {@link TokenStore} to a shared refresher + transport. Mirrors the
 * production wiring in iOS `InfraAuthApp`: one refresher/transport pair shared by
 * every client so concurrent `401`s collapse into a single token rotation.
 */
export function createSession(baseUrl: string, store: TokenStore): HarmonySession {
  const refresher: SessionRefresher = new SessionRefresher(store, () => rotateTokens(baseUrl, store));
  const transport: AuthorizedTransport = new AuthorizedTransport(baseUrl, store, refresher);
  const session: HarmonySession = { store: store, transport: transport, refresher: refresher };
  return session;
}

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
 * HarmonyOS {@link AuthClient}. Authorized requests ride the shared
 * {@link AuthorizedTransport}, which attaches the Bearer token and, on a `401`,
 * rotates the refresh token (single-flight, via {@link SessionRefresher}) and retries
 * once — so a stale 15-minute access token is refreshed transparently. Tokens land in
 * the store on verify/refresh and are cleared on logout. Non-2xx responses throw
 * {@link HttpAuthError}; transport failures bubble up as the underlying `BusinessError`.
 */
export class HarmonyAuthClient implements AuthClient {
  private readonly store: TokenStore;
  private readonly transport: AuthorizedTransport;
  private readonly refresher: SessionRefresher;
  private readonly platform: Platform;

  constructor(session: HarmonySession, platform: Platform = "harmony") {
    this.store = session.store;
    this.transport = session.transport;
    this.refresher = session.refresher;
    this.platform = platform;
  }

  private async request<T>(
    path: string,
    method: http.RequestMethod,
    body?: RequestBody,
  ): Promise<T> {
    const serialized: string | undefined = body === undefined ? undefined : JSON.stringify(body);
    const req: TransportRequest = { path: path, method: method, body: serialized };
    const res: RawResponse = await this.transport.send(req);
    const text: string = res.text;
    const json: object = text.length > 0 ? (JSON.parse(text) as object) : (JSON.parse("{}") as object);
    if (res.status < 200 || res.status >= 300) {
      throw new HttpAuthError(res.status, json as AuthErrorBody);
    }
    return json as T;
  }

  requestOtp(input: RequestOtpInput): Promise<RequestOtpResponse> {
    return this.request<RequestOtpResponse>(AUTH_ROUTES.requestOtp, http.RequestMethod.POST, input);
  }

  async verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResponse> {
    const res: VerifyOtpResponse = await this.request<VerifyOtpResponse>(
      AUTH_ROUTES.verifyOtp,
      http.RequestMethod.POST,
      input,
    );
    if (res.tokens !== undefined) {
      await this.store.save(res.tokens);
    }
    return res;
  }

  /**
   * Rotate the session through the shared refresher so a launch-time restore and an
   * in-session `401` retry can never rotate the token twice concurrently. Returns
   * null when there is no session to refresh.
   */
  refresh(): Promise<AuthTokens | null> {
    return this.rotateThroughRefresher();
  }

  private async rotateThroughRefresher(): Promise<AuthTokens | null> {
    const current: AuthTokens | null = await this.store.load();
    const stale: string | null = current === null ? null : current.accessToken;
    return this.refresher.refresh(stale);
  }

  async me(): Promise<AuthUser> {
    const res: MeResponse = await this.request<MeResponse>(AUTH_ROUTES.me, http.RequestMethod.GET);
    return res.user;
  }

  async listDevices(): Promise<DeviceDTO[]> {
    const res: DevicesResponse = await this.request<DevicesResponse>(
      AUTH_ROUTES.devices,
      http.RequestMethod.GET,
    );
    return res.devices;
  }

  async listLoginEvents(): Promise<LoginEventDTO[]> {
    const res: LoginEventsResponse = await this.request<LoginEventsResponse>(
      AUTH_ROUTES.loginEvents,
      http.RequestMethod.GET,
    );
    return res.events;
  }

  async logout(): Promise<void> {
    const body: EmptyBody = {};
    try {
      await this.request<object>(AUTH_ROUTES.logout, http.RequestMethod.POST, body);
    } finally {
      await this.store.clear();
    }
  }
}
