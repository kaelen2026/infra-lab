import {
  AUTH_ROUTES,
  type CliDeviceApproveInput,
  type CliDeviceApproveResponse,
  type CliDeviceCodeRequest,
  type CliDeviceCodeResponse,
  type CliDeviceTokenResponse,
} from "@infra/shared";
import { HttpAuthError } from "./client";

/**
 * Device-flow (browser-assisted CLI login) transport, kept separate from the
 * per-platform {@link AuthClient} interface — only the CLI (request/poll) and web
 * (approve) touch these, so native clients aren't forced to implement them.
 *
 * `request`/`poll` are called by the terminal client with no credentials (the
 * `deviceCode` is the proof); `approve` is called by the web app cookie-authenticated
 * (`credentials: "include"`). Non-2xx responses throw {@link HttpAuthError}; note the
 * token poll returns HTTP 200 for pending states, so those do NOT throw.
 */
async function postJson<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  opts: { credentials?: "include" | "omit"; fetch?: typeof fetch },
): Promise<T> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const res = await doFetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: opts.credentials ?? "omit",
    body: JSON.stringify(body),
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpAuthError(res.status, json);
  return json as T;
}

/** CLI: start a device-flow login (returns the deviceCode + userCode + poll hints). */
export function requestCliDeviceCode(
  baseUrl: string,
  input: CliDeviceCodeRequest,
  fetchImpl?: typeof fetch,
): Promise<CliDeviceCodeResponse> {
  return postJson(baseUrl, AUTH_ROUTES.cliDevice, input, { fetch: fetchImpl });
}

/** CLI: poll for the outcome. A pending status is a normal (200) result, not a throw. */
export function pollCliDeviceToken(
  baseUrl: string,
  deviceCode: string,
  fetchImpl?: typeof fetch,
): Promise<CliDeviceTokenResponse> {
  return postJson(baseUrl, AUTH_ROUTES.cliDeviceToken, { deviceCode }, { fetch: fetchImpl });
}

/** Web: approve (or deny) a device-flow request; cookie-authenticated. */
export function approveCliDevice(
  baseUrl: string,
  input: CliDeviceApproveInput,
  fetchImpl?: typeof fetch,
): Promise<CliDeviceApproveResponse> {
  return postJson(baseUrl, AUTH_ROUTES.cliDeviceApprove, input, {
    credentials: "include",
    fetch: fetchImpl,
  });
}
