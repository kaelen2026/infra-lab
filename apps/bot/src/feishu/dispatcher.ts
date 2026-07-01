import type { FeishuMessageReceiveEvent } from "./types";

/**
 * 本地派发：grain 原版这里调 GitHub Actions workflow_dispatch 把任务甩到云端牛马。
 * 本项目「先不考虑远端能力」，所以保留「翻译事件 → 派发」的形状，但派发目标换成一个
 * 进程内的 `LocalTaskHandler` 占位接口——以后要接本地 LLM、任务队列、还是重新接回
 * 远端 workflow，都从 `setLocalTaskHandler` 这一个口子进，不用动上游链路。
 *
 * 默认 handler 只做结构化 log（把 renderTask 的产物打出来），证明链路通了。
 */

/** dispatcher 翻译出的、交给本地 handler 的任务载体。 */
export interface RenderedTask {
  /** 自然语言 task 文本（自描述：来源、相关 ID、原文等），handler 可直接喂给 LLM。 */
  task: string;
  /** thread 维度的稳定 key（root_id 或首条 message_id），可作本地 session 复用单位。 */
  threadKey: string;
  /** 原始事件，给想要结构化字段（而非自然语言串）的 handler 兜底用。 */
  event: FeishuMessageReceiveEvent;
}

export interface LocalTaskHandler {
  handle(task: RenderedTask): Promise<void> | void;
}

/**
 * 默认占位 handler：只把翻译后的 task 打到日志。
 * 这就是「远端能力」的接入点——真正要干活时 `setLocalTaskHandler` 换掉它即可。
 */
const defaultHandler: LocalTaskHandler = {
  handle(t) {
    console.info(
      "[feishu→local] dispatch（占位 handler）",
      JSON.stringify({ threadKey: t.threadKey, taskLength: t.task.length }),
    );
    console.info(t.task);
  },
};

let handler: LocalTaskHandler = defaultHandler;

/** 替换本地任务处理实现（接 LLM / 队列 / 远端的唯一入口）。 */
export function setLocalTaskHandler(h: LocalTaskHandler): void {
  handler = h;
}

/** 恢复默认占位 handler（主要给测试用）。 */
export function resetLocalTaskHandler(): void {
  handler = defaultHandler;
}

/**
 * 把飞书消息事件翻译成自然语言 task，交给本地 handler 处理。
 * 这是 responder 的 `dispatch` 工具最终落点；返回 ok 仅表示「已交给 handler」，
 * 不代表 handler 内部成功（handler 自己负责自己的成败语义）。
 */
export async function dispatchLocal(
  event: FeishuMessageReceiveEvent,
): Promise<{ ok: boolean; error?: string }> {
  const task = renderTask(event);
  const threadKey = deriveThreadKey(event);
  try {
    await handler.handle({ task, threadKey, event });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[feishu→local] handler 抛异常", err);
    return { ok: false, error: message };
  }
}

/**
 * thread 复用单位的稳定 key：
 * - 群聊 thread / p2p thread：消息有 root_id，落到 root_id（thread 第一条 message_id）
 * - 主聊天流的第一条消息：root_id 缺失，落到自己的 message_id
 *
 * 不用 chat_id 作 fallback：群聊主聊天流如果按 chat_id 兜底，会把全群所有 @ 都塞进同一
 * session，话题污染严重。改成 message_id 兜底后，主聊天流上不相关的 @ 各开各的 session。
 */
export function deriveThreadKey(event: FeishuMessageReceiveEvent): string {
  return event.message.root_id || event.message.message_id;
}

/**
 * 把飞书事件 payload 渲染成 task 文本。写得"像同事在工单里描述"——handler / LLM
 * 看完自然知道要去做什么。
 *
 * 不做：不剥离 mentions、不解析 message.content 的 JSON 结构、不预判任务类型。
 * 这些下游需要时自己解析即可，复述 = 浪费 token + 漂移风险。
 */
export function renderTask(event: FeishuMessageReceiveEvent): string {
  const { sender, message } = event;

  const meta = formatKeyValueLines({
    chat_id: message.chat_id,
    chat_type: message.chat_type,
    message_id: message.message_id,
    root_id: message.root_id,
    parent_id: message.parent_id,
    thread_id: message.thread_id,
    message_type: message.message_type,
    sender_open_id: sender.sender_id.open_id,
    sender_user_id: sender.sender_id.user_id,
    sender_type: sender.sender_type,
    tenant_key: sender.tenant_key,
    create_time: formatFeishuTimestamp(message.create_time),
  });

  const mentions = message.mentions?.length
    ? `\n\nmentions：\n${message.mentions
        .map((m) => `- key=${m.key} name=${m.name} open_id=${m.id.open_id}`)
        .join("\n")}`
    : "";

  return `你收到一条来自飞书 IM 的消息。

载体元信息：
${meta}

消息原始 content（JSON 字符串，结构随 message_type 变化）：
\`\`\`
${message.content}
\`\`\`${mentions}`;
}

function formatKeyValueLines(entries: Record<string, string | undefined>): string {
  return Object.entries(entries)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
}

function formatFeishuTimestamp(raw: string): string {
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return raw;
  // 飞书 create_time 单位是毫秒
  return new Date(ts).toISOString();
}
