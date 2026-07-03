import {
  type CliDeviceCodeRequest,
  type CliDeviceCodeResponse,
  type CliDeviceTokenResponse,
  pollCliDeviceToken,
  requestCliDeviceCode,
  type TokenStore,
} from "@infra/sdk";
import { describeDevice } from "../device.js";
import type { CliIO } from "../io.js";

export interface WebLoginDeps {
  apiUrl: string;
  tokens: TokenStore;
  io: CliIO;
  /** Stable per-install id sent with the device-flow request. */
  deviceId: string;
  /** Open a URL in the default browser (best-effort). */
  openUrl: (url: string) => Promise<void> | void;
  // Injectable transport + timing so tests run hermetically and instantly.
  requestCode?: (apiUrl: string, input: CliDeviceCodeRequest) => Promise<CliDeviceCodeResponse>;
  pollToken?: (apiUrl: string, deviceCode: string) => Promise<CliDeviceTokenResponse>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Browser-assisted login via the OAuth device flow (gh-style). Requests a device +
 * user code, opens the browser to the approval page (reusing the user's existing web
 * session), and polls until the API hands back this CLI's own Bearer + refresh
 * tokens — which the SDK never routes through the browser. On success the tokens are
 * persisted to the file store, exactly like the terminal-OTP login, so later commands
 * reuse the session.
 */
export async function runLoginWeb(deps: WebLoginDeps): Promise<number> {
  const { apiUrl, tokens, io, deviceId, openUrl } = deps;
  const requestCode = deps.requestCode ?? requestCliDeviceCode;
  const pollToken = deps.pollToken ?? pollCliDeviceToken;
  const sleep = deps.sleep ?? realSleep;
  const now = deps.now ?? Date.now;

  const info = describeDevice(deviceId);
  const started = await requestCode(apiUrl, {
    deviceId,
    model: info.model,
    osVersion: info.osVersion,
    appVersion: info.appVersion,
  });

  const url = `${started.verificationUri}?user_code=${encodeURIComponent(started.userCode)}`;
  io.print(`请在浏览器中确认此登录码: ${started.userCode}`);
  io.print(`如未自动打开,请手动访问: ${url}`);
  await openUrl(url);
  io.print("等待浏览器确认…");

  let interval = started.interval;
  const deadline = now() + started.expiresIn * 1000;
  while (now() < deadline) {
    await sleep(interval * 1000);
    const result = await pollToken(apiUrl, started.deviceCode);
    if (result.ok) {
      await tokens.save(result.tokens);
      io.print(`已登录:${result.user.displayName ?? result.user.phone}`);
      return 0;
    }
    switch (result.status) {
      case "authorization_pending":
        break;
      case "slow_down":
        interval += 5; // RFC 8628: back off, then keep polling
        break;
      case "access_denied":
        io.error("已在浏览器中拒绝授权。");
        return 1;
      case "expired_token":
        io.error("登录码已过期,请重试 `infra-lab auth login --web`。");
        return 1;
    }
  }
  io.error("登录超时,请重试。");
  return 1;
}
