import { parseBotEnv } from "@infra/env/bot";
import * as Lark from "@larksuiteoapi/node-sdk";
import { routeMessageReceive } from "./event-router";
import type { FeishuMessageReceiveEvent } from "./types";

let started = false;

// ─────────────────────────────────────────────────────────────────────────────
// 幂等去重：飞书长连接要求"3 秒内处理完"，超时会重推同一条消息（同一 message_id）。
// LLM 接待经常超 3s，所以两件事一起做：
//  ① handler 立即 return（fire-and-forget），让 SDK 第一时间 ack 飞书；
//  ② 用 message_id 内存 LRU 去重，兜底 SDK 内部 retry / tsx --watch 边界。
// ─────────────────────────────────────────────────────────────────────────────
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const DEDUPE_MAX = 1024;
const dedupeCache = new Map<string, number>();

function isDuplicateMessage(messageId: string | undefined): boolean {
  if (!messageId) return false;
  const now = Date.now();
  for (const [k, t] of dedupeCache) {
    if (now - t > DEDUPE_WINDOW_MS) dedupeCache.delete(k);
  }
  if (dedupeCache.has(messageId)) return true;
  if (dedupeCache.size >= DEDUPE_MAX) {
    const oldest = dedupeCache.keys().next().value;
    if (oldest !== undefined) dedupeCache.delete(oldest);
  }
  dedupeCache.set(messageId, now);
  return false;
}

/**
 * 启动飞书事件长连接（WebSocket）。
 *
 * 选择长连接而不是 webhook 的原因：
 *  - 本地开发不需要内网穿透；
 *  - 不依赖入站防火墙规则 / 公网 URL；
 *  - 集群模式（同一应用部署多客户端）由飞书侧随机派发，不会重复消费。
 *
 * 鉴权由 SDK 用 LARK_APP_ID + LARK_APP_SECRET 自动换 tenant_access_token。
 */
export function startFeishuWsClient(): void {
  if (started) return;

  const { LARK_APP_ID, LARK_APP_SECRET, LARK_DOMAIN } = parseBotEnv();
  if (!LARK_APP_ID || !LARK_APP_SECRET) {
    console.warn("[feishu] 缺少 LARK_APP_ID / LARK_APP_SECRET，跳过 ws client 启动");
    return;
  }
  started = true;

  const wsClient = new Lark.WSClient({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
    domain: LARK_DOMAIN === "Lark" ? Lark.Domain.Lark : Lark.Domain.Feishu,
    loggerLevel: Lark.LoggerLevel.info,
    // pong watchdog（SDK 默认关闭）。不开的话,半开 TCP（NAT/中间设备静默回收,
    // 无 FIN/RST）永远检测不到:autoReconnect 只挂在 close/error 事件上,bot 会
    // 一直守着死连接,表现为「跑一段时间后不响应,重启容器恢复」。2026-07-03 事故:
    // 09:40 静默断开后零日志直到 10:23 人工重启,而同日 9 次可见断连均自动重连。
    // SDK 每 120s ping 一次;每次 ping 后 30s 内无任何入站帧即 terminate,走标准
    // 重连流程,最坏约 2.5 分钟自愈。
    wsConfig: { pingTimeout: 30 },
  });

  wsClient.start({
    eventDispatcher: new Lark.EventDispatcher({}).register({
      "im.message.receive_v1": async (data) => {
        // SDK 把所有字段标为 optional 是保守的兜底；im.message.receive_v1 在
        // 实际推送中 sender/message 的关键字段必填，routeMessageReceive 自己也会
        // guard。这里直接 cast 不会引入运行时风险。
        const event = data as unknown as FeishuMessageReceiveEvent;

        // 【临时排障】确认 receive_v1 是否真到、关键字段长啥样。定位完可删。
        console.info(
          "[feishu][debug] 收到 receive_v1",
          JSON.stringify({
            message_id: event.message?.message_id,
            chat_type: event.message?.chat_type,
            message_type: event.message?.message_type,
            sender_type: event.sender?.sender_type,
            sender_open_id: event.sender?.sender_id?.open_id,
          }),
        );

        if (isDuplicateMessage(event.message?.message_id)) {
          console.info(`[feishu] 重复事件 message_id=${event.message?.message_id}，跳过`);
          return;
        }

        // Fire-and-forget：handler 立即 return → SDK 立刻 ack 飞书，避免 3s 超时重推。
        // 实际处理在后台跑（responder 最快 react + 回 notice + 派发本地）。
        // 【临时排障】把路由结果也打出来——router 在「非 user / 群未 @」等分支是静默
        // return 的，不打的话「收到但被丢弃」会看起来像「没反应」。定位完可删。
        routeMessageReceive(event)
          .then((r) => {
            console.info("[feishu][debug] 路由结果", JSON.stringify(r));
          })
          .catch((err) => {
            console.error("[feishu] routeMessageReceive 抛异常", err);
          });
      },
    }),
  });

  console.info(`[feishu] WS client 启动 (app_id=${LARK_APP_ID})`);
}
