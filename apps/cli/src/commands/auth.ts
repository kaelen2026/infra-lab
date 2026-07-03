import type { AuthClient } from "@infra/sdk";
import { HttpAuthError } from "@infra/sdk";
import { CLI_PLATFORM, withRefresh } from "../client.js";
import { describeDevice } from "../device.js";
import type { CliIO } from "../io.js";

export interface AuthCommandDeps {
  auth: AuthClient;
  io: CliIO;
  /** Stable per-install id sent with the login (see device.ts). */
  deviceId: string;
}

/**
 * Interactive terminal login: request an OTP for a phone, then verify the code.
 * On success the SDK persists the returned Bearer + refresh tokens via the file
 * token store, so subsequent commands (and future runs) reuse the session.
 * `login == register` — a brand-new phone is created on first successful verify.
 */
export async function runLogin(deps: AuthCommandDeps): Promise<number> {
  const { auth, io, deviceId } = deps;

  const phone = await io.prompt("手机号 (E.164, 如 +8613800138000): ");
  const requested = await auth.requestOtp({ phone, platform: CLI_PLATFORM });
  io.print(
    `验证码已发送,${requested.ttlSeconds}s 内有效(${requested.resendAfterSeconds}s 后可重发)。`,
  );
  // Only present when the API runs with OTP_DEBUG_RETURN_CODE (dev). Never in prod.
  if (requested.debugCode) io.print(`[dev] 调试验证码: ${requested.debugCode}`);

  const code = await io.prompt("验证码 (6 位): ");
  const verified = await auth.verifyOtp({
    phone,
    code,
    platform: CLI_PLATFORM,
    device: describeDevice(deviceId),
  });

  const who = verified.user.displayName ?? verified.user.phone;
  io.print(verified.user.isNew ? `已注册并登录:${who}` : `已登录:${who}`);
  return 0;
}

/** Print the current user, refreshing the access token once if it has expired. */
export async function runWhoami(deps: AuthCommandDeps): Promise<number> {
  const { auth, io } = deps;
  try {
    const user = await withRefresh(auth, () => auth.me());
    io.print(`手机号: ${user.phone}`);
    if (user.displayName) io.print(`昵称:   ${user.displayName}`);
    io.print(`用户 ID: ${user.id}`);
    return 0;
  } catch (err) {
    if (err instanceof HttpAuthError && err.status === 401) {
      io.error("尚未登录。请先运行 `infra-lab auth login`。");
      return 1;
    }
    throw err;
  }
}

/** Revoke the session server-side and clear the local credentials file. */
export async function runLogout(deps: AuthCommandDeps): Promise<number> {
  const { auth, io } = deps;
  await auth.logout();
  io.print("已退出登录,本地凭据已清除。");
  return 0;
}
