import { parseFeishuEnv } from "@infra/env/feishu";
import * as Lark from "@larksuiteoapi/node-sdk";

let cached: Lark.Client | null | undefined;

/**
 * 飞书出站 API client（与 ws-client 那条入站长连接独立）。
 * 鉴权用 LARK_APP_ID + LARK_APP_SECRET，SDK 自动管 tenant_access_token 缓存与续期。
 *
 * 缺 env 时返回 null 不抛——让调用侧自己决定降级（多数场景是静默跳过）。
 */
export function getLarkClient(): Lark.Client | null {
  if (cached !== undefined) return cached;
  const { LARK_APP_ID, LARK_APP_SECRET, LARK_DOMAIN } = parseFeishuEnv();
  if (!LARK_APP_ID || !LARK_APP_SECRET) {
    cached = null;
    return null;
  }
  cached = new Lark.Client({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
    domain: LARK_DOMAIN === "Lark" ? Lark.Domain.Lark : Lark.Domain.Feishu,
  });
  return cached;
}
