import type * as Lark from "@larksuiteoapi/node-sdk";
import { getLarkClient } from "./lark-client";

/**
 * 把飞书发起人 open_id 换成人可读的姓名，供派发时记录「谁发起的」。
 *
 * 事件本身只带 open_id（`ou_xxx`，不透明），审计/‌run-name 里需要人名。这里用出站
 * Lark client 调 contact.v3.user.get 换姓名。飞书应用需授予 `contact:user.base:readonly`
 * 一类通讯录读权限。
 *
 * 全程「尽力而为」：无 client、无权限、API 抛错一律返回 undefined，**绝不抛**——发起人
 * 姓名只是锦上添花，不能阻断主派发链路（调用侧降级回 open_id）。
 */

// 姓名基本不变，进程内缓存避免每条消息都打一次 contact API。仅缓存成功结果——失败不缓存，
// 免得一次瞬时故障把某人永久钉成「无名」。带上限，防止长期运行内存无界增长。
const MAX_CACHE_ENTRIES = 500;
const nameCache = new Map<string, string>();

export interface UserNameDeps {
  /** 出站 Lark client；不传则用默认 getLarkClient()。仅测试需要注入（含注入 null 模拟缺凭证）。 */
  client?: Lark.Client | null;
}

export async function resolveSenderName(
  openId: string,
  deps: UserNameDeps = {},
): Promise<string | undefined> {
  if (!openId) return undefined;

  const cached = nameCache.get(openId);
  if (cached !== undefined) return cached;

  const client = deps.client === undefined ? getLarkClient() : deps.client;
  if (!client) return undefined;

  try {
    const resp = await client.contact.v3.user.get({
      path: { user_id: openId },
      params: { user_id_type: "open_id" },
    });
    const name = resp?.data?.user?.name;
    if (name) {
      cacheName(openId, name);
      return name;
    }
    return undefined;
  } catch (err) {
    // 不打印入参（open_id 是用户标识）；只记一句无 payload 的降级日志。
    console.warn(
      `[feishu] 解析发起人姓名失败，降级回 open_id：${err instanceof Error ? err.message : err}`,
    );
    return undefined;
  }
}

function cacheName(openId: string, name: string): void {
  if (nameCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = nameCache.keys().next().value;
    if (oldest !== undefined) nameCache.delete(oldest);
  }
  nameCache.set(openId, name);
}

/** 清空姓名缓存（仅测试用）。 */
export function __resetUserNameCacheForTest(): void {
  nameCache.clear();
}
