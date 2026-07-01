import { readFileSync } from "node:fs";
import { generateText, hasToolCall, stepCountIs } from "ai";
import { getResponderModel } from "../../ai-config";
import { dispatchLocal } from "../dispatcher";
import { replyMarkdown } from "../reply";
import type { FeishuMessageReceiveEvent } from "../types";
import { createResponderActionTools, type ResponderToolDeps } from "./tools";

const RESPONDER_PROMPT = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");

type ResponderTools = ReturnType<typeof createResponderActionTools>["tools"];

/**
 * 按步骤收口工具可见性，把「先 react、后 dispatch」做成 SDK 层的运行时契约而非靠
 * 模型自觉：
 *  - 第 0 步：只开放 `react` 并强制调用它（emoji 仍由模型按语境自选）；
 *  - 第 1 步起：只开放 `dispatch` 并强制调用它。
 *
 * 为什么不能把两个工具同步开放让模型自己排序：AI SDK 在同一步会用 `Promise.all`
 * 并发执行模型返回的多个 tool call。若模型在同一步同时吐出 `react` 和 `dispatch`，
 * dispatch 工具会先 `ensureReacted` 补默认 emoji，模型自选的 react 又并发出站 →
 * 同一条消息被打两次 reaction，且 notice/dispatch 与 react 的先后不可控。
 * 用 `activeTools` 让 react 与 dispatch 永不在同一步可见，从结构上消除这条竞态。
 */
export function responderStepGate(stepNumber: number): {
  activeTools: Array<keyof ResponderTools>;
  toolChoice: { type: "tool"; toolName: keyof ResponderTools };
} {
  if (stepNumber === 0) {
    return {
      activeTools: ["react"],
      toolChoice: { type: "tool", toolName: "react" },
    };
  }
  return {
    activeTools: ["dispatch"],
    toolChoice: { type: "tool", toolName: "dispatch" },
  };
}

/**
 * 降级兜底时同步发回的固定安抚文字。正常路径由 agent 自拟 notice（更贴合语境），
 * 但 agent 抛错 / 未 dispatch / 没配 LLM 时没有可用的 notice，只能发这句兜底——目的
 * 同样是让用户立刻看到反馈，而不是以为消息被吞。
 */
const FALLBACK_NOTICE = "收到，我看一下，稍等";

export interface RunFeishuResponderDeps extends ResponderToolDeps {
  /**
   * 仅供单元测试注入：替换真正跑 agent 那一步（构造模型并 generateText）。
   * 生产环境留空走默认实现。注入后可在测试里模拟 agent 先 react 再 dispatch /
   * 抛错 / 不 dispatch，从而覆盖各条分支。
   */
  runAgent?: (tools: ResponderTools, userMessage: string) => Promise<void>;
}

/** 默认的跑 agent 实现：构造 LLM 并多步 generate（react → dispatch）。 */
async function defaultRunAgent(tools: ResponderTools, userMessage: string): Promise<void> {
  const model = getResponderModel();
  if (!model) {
    // 没配 LLM_*：直接抛，让 runFeishuResponder 走降级（固定 notice + 直接派发）。
    throw new Error("responder model 未配置（缺 LLM_BASE_URL/LLM_API_KEY/LLM_MODEL）");
  }
  // 第 0 步强制 react、第 1 步起只开放 dispatch（见 responderStepGate）。正常流程
  // 即「react → dispatch」两步：react 非终止、dispatch 命中 hasToolCall 即停；
  // stepCountIs 仅作极端情况的空转兜底。
  await generateText({
    model,
    system: RESPONDER_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    tools,
    prepareStep: ({ stepNumber }) => responderStepGate(stepNumber),
    stopWhen: [stepCountIs(4), hasToolCall("dispatch")],
  });
}

/**
 * fast-responder：飞书消息进系统后第一道处理。它**不自己答任何实质问题**——
 * 没有数据工具、不拉历史、不看图。每条消息的标准流程都一样：
 *
 *   收到 → react（贴语境的 emoji，最快、拟人化）→ 写 notice（在 thread 回）→ 派发本地
 *
 * 这三步都由 agent 跑：它先调 react 打一个由它按语境挑的 emoji（非终止），再调
 * dispatch 工具写 notice 并派发。真正的执行由本地 dispatcher 的 handler 决定。
 *
 * 失败降级：agent 抛错 / 没配 LLM / 罕见地没 dispatch → 先补 react + 发一句固定
 * notice 再 dispatchLocal，保证任何消息既不会被吞、用户也不会在静默里干等。
 */
export async function runFeishuResponder(
  event: FeishuMessageReceiveEvent,
  deps: RunFeishuResponderDeps = {},
): Promise<{ handled: boolean; reason?: string }> {
  const reply = deps.replyMarkdown ?? replyMarkdown;
  const dispatch = deps.dispatchLocal ?? dispatchLocal;
  const runAgent = deps.runAgent ?? defaultRunAgent;
  const { tools, getDecision, ensureReacted } = createResponderActionTools(event, deps);

  // 降级：复用工具层的 ensureReacted 把「react → notice → dispatch」契约延伸到
  // 兜底路径——agent 在工具调用前抛错 / 跑完未 dispatch 时，主路径补不上 react，
  // 由这里补一次默认 emoji；agent 已 react 过则 ensureReacted 是 no-op，不重复打。
  const fallbackToDispatch = async (
    reason: string,
  ): Promise<{ handled: boolean; reason?: string }> => {
    await ensureReacted();
    await reply(event.message.message_id, FALLBACK_NOTICE);
    await dispatch(event);
    return { handled: true, reason };
  };

  // 只把当前这条消息喂给 agent——它不需要历史 / 图片，按 prompt 先 react 再 dispatch。
  const userMessage = `飞书消息事件。先给它打一个贴合语境的 emoji react，再调 dispatch 把它派发到后端，并附一句简短安抚。

- chat_type: ${event.message.chat_type}
- message_type: ${event.message.message_type}
- 原始 content：

\`\`\`
${event.message.content}
\`\`\``;

  try {
    await runAgent(tools, userMessage);

    if (getDecision()?.kind === "dispatch") {
      return { handled: true, reason: "dispatch" };
    }
  } catch (err) {
    console.error("[feishu→responder] agent 异常，降级到本地派发", err);
    return fallbackToDispatch("fallback-after-error");
  }

  console.warn("[feishu→responder] agent 未调用 dispatch，降级到本地派发");
  return fallbackToDispatch("fallback-empty");
}
