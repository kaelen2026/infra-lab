import { parseBotEnv } from "@infra/env/bot";
import { runFeishuResponder } from "./responder";
import type { FeishuMessageReceiveEvent } from "./types";

/**
 * 飞书 im.message.receive_v1 事件路由。
 *
 * 这一层只做事件总线的基本卫生（回环过滤、群聊 @ 判断），决定"消息要不要进系统"；
 * 进系统后统一交给 fast-responder：它先最快打个 emoji react，再回一句安抚 notice，
 * 然后派发到本地处理（dispatcher）。event-router 不再直接调 dispatcher。
 */

// 测试接缝：用 holder 包一层，让 event-router 单测可以替换 runFeishuResponder 而无需
// module mock。生产代码请勿改这个字段，要换实现请改 responder 模块本身。
export const __routerDeps: {
  runFeishuResponder: typeof runFeishuResponder;
} = {
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

  // 2. 群聊准入：必须 @ bot 才放行。
  //    历史上曾允许「bot 已参与过的 thread 内回复免 @」，后来发现 thread 本身也是讨论
  //    流——成员之间相互讨论会被误处理成对 bot 的请求，产生大量无关 AI 触发，得不偿失。
  //    现在统一靠 @ 触发，bot 只在被点名时介入。
  if (message.chat_type === "group") {
    const { FEISHU_BOT_OPEN_ID } = parseBotEnv();
    if (!FEISHU_BOT_OPEN_ID) {
      console.error("[feishu] 缺少 FEISHU_BOT_OPEN_ID，无法判断群聊 @；拒绝转发");
      return { handled: false, reason: "missing-bot-open-id" };
    }
    const mentioned = message.mentions?.some((m) => m.id.open_id === FEISHU_BOT_OPEN_ID);
    if (!mentioned) {
      return { handled: false, reason: "group-without-mention" };
    }
  }

  // 3. 交给 fast-responder：最快 react → 回 notice → 派发本地（dispatcher）
  const result = await __routerDeps.runFeishuResponder(event);
  console.info(
    `[feishu→responder] chat=${message.chat_id} message=${message.message_id} sender=${sender.sender_id.open_id} → ${result.reason}`,
  );
  return result;
}
