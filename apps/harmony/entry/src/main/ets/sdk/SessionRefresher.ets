import { http } from "@kit.NetworkKit";
import { AUTH_ROUTES, AuthErrorBody, AuthTokens, RefreshResponse } from "../common/contracts";
import { HttpAuthError } from "./AuthError";
import { TokenStore } from "./TokenStore";

/**
 * Rotates the stored refresh token over the wire and returns the result (null when
 * there is no session). Injected into {@link SessionRefresher} so it stays free of
 * route/URL knowledge and tests can inject a fake.
 */
export type Rotate = () => Promise<AuthTokens | null>;

/** Request body for POST /auth/refresh. ArkTS requires a named type per object literal. */
interface RefreshRequestBody {
  refreshToken: string;
}

/**
 * Coordinates refresh-token rotation shared by every authorized client
 * (auth / todo). The native access token is a short-lived JWT; when a request comes
 * back `401` the transport asks this refresher to rotate the token and retries once.
 *
 * Because the clients share one {@link TokenStore} **and** the refresh token rotates
 * on every use (the server revokes the old one), two concurrent refreshes would
 * invalidate each other. This collapses them into a single in-flight rotation: late
 * callers either join the running refresh or, if a peer already rotated past the
 * token that failed, reuse the fresh one without a second round-trip.
 *
 * ArkTS runs on a single-threaded event loop, so the `inFlight` check-and-assign
 * below is atomic (no `await` between them) — the ArkTS analogue of iOS's actor.
 */
export class SessionRefresher {
  private readonly store: TokenStore;
  private readonly rotate: Rotate;
  private inFlight: Promise<AuthTokens | null> | null = null;

  constructor(store: TokenStore, rotate: Rotate) {
    this.store = store;
    this.rotate = rotate;
  }

  /**
   * Refresh the session relative to `staleAccessToken` — the access token that just
   * produced a `401`. If another caller already rotated past it, return the current
   * tokens directly; otherwise run (or join) the one in-flight rotation.
   */
  async refresh(staleAccessToken: string | null): Promise<AuthTokens | null> {
    const current: AuthTokens | null = await this.store.load();
    if (current !== null && current.accessToken !== staleAccessToken) {
      return current;
    }

    const existing: Promise<AuthTokens | null> | null = this.inFlight;
    if (existing !== null) {
      return existing;
    }

    const task: Promise<AuthTokens | null> = this.rotate();
    this.inFlight = task;
    try {
      return await task;
    } finally {
      this.inFlight = null;
    }
  }
}

/**
 * Direct, non-retrying refresh-token rotation. Kept off {@link SessionRefresher}'s
 * transport (which retries on `401`) so a failed refresh can never recurse into
 * another refresh. Mirrors iOS `AuthSession.rotateTokens` and the web SDK's
 * `/auth/refresh`. Persists the rotated tokens; throws {@link HttpAuthError} on non-2xx.
 */
export async function rotateTokens(baseUrl: string, store: TokenStore): Promise<AuthTokens | null> {
  const current: AuthTokens | null = await store.load();
  if (current === null) {
    return null;
  }

  const body: RefreshRequestBody = { refreshToken: current.refreshToken };
  const header: Record<string, string> = { "Content-Type": "application/json" };
  const request: http.HttpRequest = http.createHttp();
  try {
    const options: http.HttpRequestOptions = {
      method: http.RequestMethod.POST,
      header: header,
      expectDataType: http.HttpDataType.STRING,
      extraData: JSON.stringify(body),
    };
    const response: http.HttpResponse = await request.request(`${baseUrl}${AUTH_ROUTES.refresh}`, options);
    const status: number = response.responseCode;
    const text: string = (response.result as string) ?? "";
    const json: object = text.length > 0 ? (JSON.parse(text) as object) : (JSON.parse("{}") as object);
    if (status < 200 || status >= 300) {
      throw new HttpAuthError(status, json as AuthErrorBody);
    }
    const res: RefreshResponse = json as RefreshResponse;
    await store.save(res.tokens);
    return res.tokens;
  } finally {
    request.destroy();
  }
}
