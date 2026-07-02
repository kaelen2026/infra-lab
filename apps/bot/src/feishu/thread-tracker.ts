import { getLarkClient } from "./lark-client";

/**
 * 判断「群聊里一条无 @ 的消息所在的话题（thread）」是不是 bot 参与过的话题。
 *
 * 背景：飞书群里 @ bot 才会触发接待链路（见 event-router）。但 bot 的回帖默认
 * `reply_in_thread`，用户会顺着话题继续追问，每条都要再 @ 一次体验很差。这里给
 * event-router 提供判定：话题归属 bot → 同话题后续回复免 @ 放行。
 *
 * 实现策略（移植自 grain #1793 的 thread-tracker）：
 *  - 飞书话题由「被回复的那条消息」充当根（root_id 指向它）；bot 之所以出现在话题里，
 *    必然是有人 @ 它（群聊接待唯一入口）或 bot 自己发了根消息。
 *  - 所以只需拉一次 root 消息：`sender_type === 'app'`（bot 自己开的）或 `mentions`
 *    含 bot open_id（用户 @ bot 开的）任一成立即视为参与。不需要遍历整个话题——
 *    root 决定话题归属。
 *  - 注意范围：这不是当年被撤销的「所有 thread 回复都放行」（grain #1832 的误触发教训），
 *    成员之间自己开的话题 root 不含 bot，仍会被丢弃。
 *
 * 性能：群里每条「没 @ 但有 root_id」的消息触发一次 message.get。LRU 缓存
 * root_id → 判定结果，同话题重复命中不再调 API；进程重启缓存清空，首条冷查询可接受。
 *
 * 权限依赖：读非 @ 消息的事件推送与 message.get 都需要飞书应用开通
 * `im:message.group_msg`（获取群组中所有消息）；只有 `im:message.group_at_msg` 时
 * 非 @ 消息根本不会推送进来，这条路径自然不会触发。
 */

const CACHE_MAX = 1024;
const cache = new Map<string, boolean>();

// 测试接缝：holder 包一层让单测替换 lark client 而无需 module mock（与 event-router
// 的 __routerDeps 同一模式）。生产代码请勿改这个字段。
export const __trackerDeps: {
  getLarkClient: typeof getLarkClient;
} = {
  getLarkClient,
};

function setCache(key: string, value: boolean): void {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

export async function isBotInThread(rootMessageId: string, botOpenId: string): Promise<boolean> {
  const cached = cache.get(rootMessageId);
  if (cached !== undefined) return cached;

  const client = __trackerDeps.getLarkClient();
  if (!client) return false;

  try {
    const res = await client.im.v1.message.get({
      path: { message_id: rootMessageId },
    });
    const root = res.data?.items?.[0];
    if (!root) {
      // 找不到（被撤回 / 权限不足 / 临时网络）不写缓存，下次再查
      return false;
    }
    const isBotRoot = root.sender?.sender_type === "app";
    // message.get 资源里 mentions[].id 直接是 open_id 字符串（与事件 payload 的
    // mentions[].id.open_id 结构不同）
    const mentionsBot = root.mentions?.some((m) => m.id === botOpenId) ?? false;
    const involved = isBotRoot || mentionsBot;
    setCache(rootMessageId, involved);
    return involved;
  } catch (err) {
    // 拉 root 失败不缓存；让下一次重试，避免一次抖动永久把这个话题当作非 bot 参与
    console.warn(`[feishu] 查话题 root 消息失败 root=${rootMessageId}`, err);
    return false;
  }
}

/** 仅供测试用：清掉所有缓存，保证用例之间隔离。 */
export function __clearThreadCacheForTest(): void {
  cache.clear();
}
