import { http } from "@kit.NetworkKit";
import { AuthTokens } from "../common/contracts";
import { SessionRefresher } from "./SessionRefresher";
import { TokenStore } from "./TokenStore";

/**
 * A request the transport will send — and replay verbatim on a `401` retry.
 * `body` is pre-serialized JSON (or undefined for a body-less GET/DELETE) so the
 * retry reuses the exact same payload while picking up a fresh Authorization header.
 */
export interface TransportRequest {
  path: string;
  method: http.RequestMethod;
  body?: string;
}

/** Raw HTTP result handed back to each client for its own decode + typed-error mapping. */
export interface RawResponse {
  status: number;
  text: string;
}

/**
 * Shared HTTP transport for the native Bearer clients (auth / todo). It attaches the
 * session's access token and, on a `401`, transparently rotates the refresh token
 * (single-flight, via {@link SessionRefresher}) and replays the request once. Response
 * decoding and typed error mapping stay in each client — this layer only owns
 * "authorize, and retry once after a refresh". Mirrors iOS `AuthorizedTransport`.
 */
export class AuthorizedTransport {
  private readonly baseUrl: string;
  private readonly store: TokenStore;
  private readonly refresher: SessionRefresher;

  constructor(baseUrl: string, store: TokenStore, refresher: SessionRefresher) {
    this.baseUrl = baseUrl;
    this.store = store;
    this.refresher = refresher;
  }

  /**
   * Send `req` with the current access token attached. On a `401` (and only when a
   * session was actually sent) rotate the token once and replay — the replay re-reads
   * the store, so it picks up the freshly rotated Authorization header.
   */
  async send(req: TransportRequest): Promise<RawResponse> {
    const sent: AuthTokens | null = await this.store.load();
    const sentToken: string | null = sent === null ? null : sent.accessToken;

    let res: RawResponse = await this.perform(req);
    if (res.status === 401 && sentToken !== null) {
      let refreshed: AuthTokens | null = null;
      try {
        refreshed = await this.refresher.refresh(sentToken);
      } catch (_err) {
        // A failed refresh must not mask the original 401; fall through and return it.
        refreshed = null;
      }
      if (refreshed !== null) {
        res = await this.perform(req);
      }
    }
    return res;
  }

  private async perform(req: TransportRequest): Promise<RawResponse> {
    const header: Record<string, string> = { "Content-Type": "application/json" };
    const tokens: AuthTokens | null = await this.store.load();
    if (tokens !== null) {
      header["Authorization"] = `${tokens.tokenType} ${tokens.accessToken}`;
    }

    const request: http.HttpRequest = http.createHttp();
    try {
      const options: http.HttpRequestOptions = {
        method: req.method,
        header: header,
        expectDataType: http.HttpDataType.STRING,
        extraData: req.body,
      };
      const response: http.HttpResponse = await request.request(`${this.baseUrl}${req.path}`, options);
      const text: string = (response.result as string) ?? "";
      const result: RawResponse = { status: response.responseCode, text: text };
      return result;
    } finally {
      request.destroy();
    }
  }
}
