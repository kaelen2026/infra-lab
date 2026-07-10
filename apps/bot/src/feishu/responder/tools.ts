import { type Tool, tool } from "ai";
import { z } from "zod";
import { dispatchLocal } from "../dispatcher";
import { reactWithEmoji, VALID_REACTION_EMOJIS, type ValidReactionEmoji } from "../reactions";
import { replyMarkdown } from "../reply";
import type { FeishuMessageReceiveEvent } from "../types";

export type ResponderDecision = {
  kind: "dispatch";
  reason?: string;
};

export interface ResponderToolDeps {
  /** 替换 reply / dispatch / react 出站实现，仅供单元测试注入 fake；生产环境走默认值。 */
  replyMarkdown?: typeof replyMarkdown;
  dispatchLocal?: typeof dispatchLocal;
  reactWithEmoji?: typeof reactWithEmoji;
}

/**
 * `createResponderActionTools` 的返回形状。显式标注(而非交给推断)是必需的：
 * `tool()` 的返回类型引用 `@ai-sdk` 的内部路径,导出函数上的推断类型不可移植
 * (tsc TS2742)。`tools` 保留具名 `react` / `dispatch` 两个 key,让 responder 的
 * step gate 能用 `keyof` 拿到工具名字面量。
 */
export interface ResponderActionTools {
  ensureReacted: () => Promise<void>;
  tools: { react: Tool; dispatch: Tool };
  getDecision: () => ResponderDecision | null;
}

/**
 * 模型跳过 react 直接 dispatch 时，dispatch 工具兜底补打的中性「收到/处理中」
 * emoji。正常路径 react 的 emoji 由模型按语境自选（更拟人）；这个常量只在模型
 * 漏掉 react 时用来保证「每条消息都先 react」的运行时契约不被破坏。
 */
const FALLBACK_REACTION_EMOJI: ValidReactionEmoji = "OnIt";

/**
 * 构造 fast-responder 的 agent 工具集。每条消息的标准流程都一样：
 * 先调 `react` 打一个贴合语境的 emoji（最快、拟人化、有点娱乐），再调 `dispatch`
 * 写 notice + 派发本地。
 *  - `react`：**非终止**，给原消息打一个由模型按语境挑的 emoji（不固定）；
 *  - `dispatch`：终止动作，写 notice 并把任务交给本地 dispatcher。
 *
 * dispatch 是终止工具，调用即 stop。fast-responder 没有数据工具、不拉历史、
 * 不看图，**不自己答任何实质问题**——react 之外的一切都派发本地。
 *
 * `dispatched` / `reacted` 两个同步幂等把手覆盖「同一工具被并发调两次」的竞态
 * （AI SDK 同一步返回的多个 tool call 会被并发执行），保证一条消息至多 react 一次、
 * 至多派发一次。
 */
export function createResponderActionTools(
  event: FeishuMessageReceiveEvent,
  deps: ResponderToolDeps = {},
): ResponderActionTools {
  const reply = deps.replyMarkdown ?? replyMarkdown;
  const dispatch = deps.dispatchLocal ?? dispatchLocal;
  const react = deps.reactWithEmoji ?? reactWithEmoji;
  const decision: { value: ResponderDecision | null } = { value: null };

  // 运行时契约：每条消息在 dispatch 之前必须已经 react 过一次。正常路径模型先调
  // react 工具（自选语境 emoji）置位；若模型漏掉直接 dispatch，由 ensureReacted
  // 补一个默认 emoji。无论哪条路径，react → dispatch 的顺序都不依赖模型自觉。
  const reacted = { value: false };
  const ensureReacted = async () => {
    if (reacted.value) return;
    reacted.value = true;
    await react(event.message.message_id, FALLBACK_REACTION_EMOJI);
  };

  // dispatch 幂等把手：每条消息至多派发一次。同步置位 + 早返回保证即便模型在同一步
  // 并发吐出多个 dispatch，也只有第一个真正 reply + 派发。
  const dispatched = { value: false };

  return {
    /**
     * 运行时契约的对外把手：runner 的兜底降级路径（agent 抛错 / 未 dispatch）
     * 走 reply + dispatchLocal 不经过 dispatch 工具，必须自己先调一次这个把手，
     * 保证「react → notice → dispatch」对每条消息都成立——同时复用同一份 `reacted`
     * 状态，避免对已 react 过的消息重复打。
     */
    ensureReacted,
    tools: {
      react: tool({
        description:
          '给原消息打一个 emoji reaction，作为"最快、带点娱乐"的拟人化回执。**这是每条消息的第一步，先 react 再 dispatch**。emoji_type 由你按当前这条消息的语气 / 内容自己挑一个最贴合的——别每次都用同一个，越贴语境越像人。它**不终止流程**，react 完仍要继续调 dispatch 工具。emoji_type 只能在白名单内选，超范围会被本地拒绝、不出站。',
        inputSchema: z.object({
          emoji_type: z
            .enum(VALID_REACTION_EMOJIS)
            .describe(
              "飞书 reaction 名（取值大小写敏感），按当前消息语境挑最贴合的：收到/同意 OK·THUMBSUP·LGTM·DONE·Hundred·CheckMark；致谢 THANKS·MUSCLE·FINGERHEART·APPLAUSE·ROSE·HEART；处理中 OnIt·THINKING·Typing·OneSecond·Alarm；否定 CrossMark·FACEPALM·MinusOne·ENOUGH；情绪 LAUGH·WAVE·WOW·WITTY·SHY·SPEECHLESS·Shrug；庆祝 PARTY·Trophy·Fire·AWESOMEN·LUCK·YEAH·PRAISE。",
            ),
        }),
        execute: async ({ emoji_type }) => {
          // 幂等：同一条消息至多 react 一次。即便模型在同一步并发吐出多个 react
          // 调用，只有第一个会出站，其余早返回。
          if (reacted.value) return { ok: true, skipped: true } as const;
          // 在出站前置位标记：确保即便 react 出站失败也不会让 dispatch 再补一次。
          reacted.value = true;
          return await react(event.message.message_id, emoji_type);
        },
      }),
      dispatch: tool({
        description:
          '把任务升级到后端处理。这是 react 之后的终止动作，调用即 stop——fast-responder 没有自己处理任务的能力，react 之外一切都派发后端。必填 notice：同步给用户回一句简短安抚（处理需要一点时间，没这条用户会以为消息被吞），措辞自然口语、第一人称，只表达"收到、在处理"，不要描述任务计划、不要暴露内部机制。',
        inputSchema: z.object({
          notice: z
            .string()
            .min(1)
            .describe(
              '同步发回飞书的简短安抚文字，纯粹让用户知道"消息收到了、正在处理"，例 "收到，我处理一下，稍等" / "好的，马上看"。第一人称、对用户透明。不要描述"我去做什么 / 我打算怎么做"——此处没有任何上下文，别装懂',
            ),
          reason: z.string().optional().describe("升级理由，可选（仅做日志）"),
        }),
        execute: async ({ notice, reason }) => {
          // 同一条消息至多派发一次。同步置位 + 早返回保证即便模型在同一步并发吐出
          // 多个 dispatch，也只有第一个真正 reply + 派发。
          if (dispatched.value) return { ok: true, skipped: true } as const;
          dispatched.value = true;
          // dispatch 前先保证这条消息已 react（模型漏 react 时在此补默认 emoji），
          // 让「react → notice → 派发」的顺序成为运行时契约而非靠模型自觉。
          await ensureReacted();
          // 再把 notice 投递到飞书让用户立刻有反馈，最后触发本地派发；reply 失败
          // 不阻断派发（dispatch 仍要走，否则任务会被吞）。
          await reply(event.message.message_id, notice);
          const r = await dispatch(event);
          decision.value = { kind: "dispatch", reason };
          return r;
        },
      }),
    },
    getDecision: () => decision.value,
  };
}
