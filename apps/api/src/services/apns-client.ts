import { createSign } from "node:crypto";
import { connect, constants } from "node:http2";
import type { ApnsEnvConfig } from "@infra/env/core";

/**
 * Minimal APNS (Apple Push Notification service) provider client.
 *
 * Auth is token-based (.p8): we sign a short-lived ES256 JWT with the provider key
 * (kid = key id, iss = team id) and reuse it as the `authorization: bearer <jwt>`
 * header until it nears expiry — the same mint-and-cache shape as the bot's GitHub
 * App token (see apps/bot/src/github-app-token.ts). APNS enforces HTTP/2, so the
 * default transport is `node:http2`; tests inject a fake `sender` instead.
 *
 * Secrets red line (see @infra/env/core / observability): the private key and the
 * device token are never logged.
 */

export type ApnsConfig = ApnsEnvConfig;

export interface ApnsPayload {
  title: string;
  body: string;
  /** Custom keys merged alongside `aps` in the payload (e.g. a deep-link target). */
  data?: Record<string, unknown>;
}

export type ApnsSendResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      reason?: string;
      /** APNS says this token is dead (410 / Unregistered / BadDeviceToken) → clear it. */
      unregistered: boolean;
    };

export interface ApnsClient {
  send(deviceToken: string, payload: ApnsPayload): Promise<ApnsSendResult>;
}

// ── Low-level transport (injectable so the client is testable without a socket) ──
export interface ApnsRequest {
  host: string;
  /** `/3/device/<deviceToken>` */
  path: string;
  headers: Record<string, string>;
  body: string;
}
export interface ApnsResponse {
  status: number;
  body: string;
}
export type ApnsSender = (req: ApnsRequest) => Promise<ApnsResponse>;

export interface ApnsClientDeps {
  /** Test-only: replace the HTTP/2 transport. */
  sender?: ApnsSender;
  /** Test-only: replace JWT signing. */
  signJwt?: (cfg: ApnsConfig, nowSec: number) => string;
  /** Test-only: replace the clock (ms). */
  now?: () => number;
}

// APNS accepts a provider token for 20–60 min; refresh at 40 to stay comfortably inside.
const TOKEN_TTL_MS = 40 * 60 * 1000;

const b64url = (s: string | Buffer): string => Buffer.from(s).toString("base64url");

/** Sign an APNS provider JWT (ES256, raw R||S signature as JOSE requires). */
export function defaultSignApnsJwt(cfg: ApnsConfig, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId, typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: cfg.teamId, iat: nowSec }));
  const input = `${header}.${payload}`;
  const signer = createSign("SHA256");
  signer.update(input);
  signer.end();
  // ECDSA signs to DER by default; JWT/JOSE needs the raw concatenated R||S form.
  const sig = signer.sign({ key: cfg.privateKey, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64url(sig)}`;
}

/** Default transport: one HTTP/2 request per send (APNS mandates HTTP/2). */
function http2Sender(): ApnsSender {
  return (req) =>
    new Promise<ApnsResponse>((resolve, reject) => {
      const client = connect(`https://${req.host}`);
      client.on("error", reject);
      const stream = client.request({
        [constants.HTTP2_HEADER_METHOD]: "POST",
        [constants.HTTP2_HEADER_PATH]: req.path,
        ...req.headers,
      });
      let status = 0;
      let data = "";
      stream.on("response", (headers) => {
        status = Number(headers[constants.HTTP2_HEADER_STATUS]) || 0;
      });
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => {
        data += chunk;
      });
      stream.on("end", () => {
        client.close();
        resolve({ status, body: data });
      });
      stream.on("error", (err) => {
        client.close();
        reject(err);
      });
      stream.end(req.body);
    });
}

export function createApnsClient(config: ApnsConfig, deps: ApnsClientDeps = {}): ApnsClient {
  const sign = deps.signJwt ?? defaultSignApnsJwt;
  const sender = deps.sender ?? http2Sender();
  const now = deps.now ?? Date.now;
  const host = config.production ? "api.push.apple.com" : "api.sandbox.push.apple.com";

  let cache: { token: string; expiresAtMs: number } | null = null;
  const providerToken = (): string => {
    if (cache && now() < cache.expiresAtMs) return cache.token;
    const token = sign(config, Math.floor(now() / 1000));
    cache = { token, expiresAtMs: now() + TOKEN_TTL_MS };
    return token;
  };

  return {
    async send(deviceToken, payload) {
      const body = JSON.stringify({
        aps: { alert: { title: payload.title, body: payload.body }, sound: "default" },
        ...(payload.data ?? {}),
      });
      const res = await sender({
        host,
        path: `/3/device/${deviceToken}`,
        headers: {
          authorization: `bearer ${providerToken()}`,
          "apns-topic": config.bundleId,
          "apns-push-type": "alert",
        },
        body,
      });
      if (res.status === 200) return { ok: true };

      let reason: string | undefined;
      try {
        reason = (JSON.parse(res.body) as { reason?: string }).reason;
      } catch {
        // Non-JSON error body (rare); leave reason undefined.
      }
      const unregistered =
        res.status === 410 || reason === "Unregistered" || reason === "BadDeviceToken";
      return { ok: false, status: res.status, reason, unregistered };
    },
  };
}
