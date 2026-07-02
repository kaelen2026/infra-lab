import { parseBotEnv } from "@infra/env/bot";
import { runFeishuResponder } from "./responder";
import { isBotInThread } from "./thread-tracker";
import type { FeishuMessageReceiveEvent } from "./types";

/**
 * 飞书 im.message.receive_v1 事件路由。
 *
 * 这一层只做事件总线的基本卫生（回环过滤、群聊 @ 判断），决定"消息要不要进系统"；
 * 进系统后统一交给 fast-responder：它先最快打个 emoji react，再回一句安抚 notice，
 * 然后派发到本地处理（dispatcher）。event-router 不再直接调 dispatcher。
 */

// 测试接缝：用 holder 包一层，让 event-router 单测可以替换依赖而无需 module mock。
// 生产代码请勿改这些字段，要换实现请改对应模块本身。
export const __routerDeps: {
  isBotInThread: typeof isBotInThread;
  runFeishuResponder: typeof runFeishuResponder;
} = {
  isBotInThread,
  runFeishuResponder,
};

export async function routeMessageReceive(
  event: FeishuMessageReceiveEvent,
): Promise<{ handled: boolean; reason?: string }> {
  const { sender, message } = event;

  // 1. 回环过滤：bot 自己发的消息（飞书 sender_type='app'）必须丢，否则会触发自循环
  if (sender.sender_type !== "user") {
    return { handled: false, reason: `non-user-sender:${sender.sender_type}` };
  }

  // 2. 群聊准入：要么 @ 了 bot，要么落在 bot 参与过的话题里（bot 回帖默认
  //    reply_in_thread，同话题追问免 @，这就是"话题多轮"的入口）。
  //    注意范围：曾有过「所有 thread 内回复免 @」的版本，因成员间讨论被误处理成对
  //    bot 的请求而撤销（grain #1832）；现在只放行 root 归属 bot 的话题（bot 自己
  //    开的 / 用户 @ bot 开的），成员自己开的话题仍要求 @（见 thread-tracker）。
  if (message.chat_type === "group") {
    const { FEISHU_BOT_OPEN_ID } = parseBotEnv();
    if (!FEISHU_BOT_OPEN_ID) {
      console.error("[feishu] 缺少 FEISHU_BOT_OPEN_ID，无法判断群聊 @；拒绝转发");
      return { handled: false, reason: "missing-bot-open-id" };
    }
    const mentioned = message.mentions?.some((m) => m.id.open_id === FEISHU_BOT_OPEN_ID);
    if (!mentioned) {
      if (!message.root_id) {
        return { handled: false, reason: "group-without-mention" };
      }
      const inBotThread = await __routerDeps.isBotInThread(message.root_id, FEISHU_BOT_OPEN_ID);
      if (!inBotThread) {
        return { handled: false, reason: "group-thread-not-bot-involved" };
      }
    }
  }

  // 3. 交给 fast-responder：最快 react → 回 notice → 派发本地（dispatcher）
  const result = await __routerDeps.runFeishuResponder(event);
  console.info(
    `[feishu→responder] chat=${message.chat_id} message=${message.message_id} sender=${sender.sender_id.open_id} → ${result.reason}`,
  );
  return result;
}
