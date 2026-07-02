// claude-code-action execution_file 的解析与最终文本提取，供 feishu-reply.mjs /
// extract-result.mjs 共用（此前两处各持一份「同源」拷贝）。
// 纯函数、零依赖、不碰网络与文件系统，便于 vitest 直接单测。

/** 把 execution_file 原文解析成消息数组。数组 / JSONL 两种落盘格式都兼容。 */
export function parseMessages(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
}

/** 取最终回答文本：优先 stream-json 的 result 消息，兜底最后一条 assistant 文本。 */
export function extractResultText(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  // 优先取 stream-json 的最终 result 消息（{ type: "result", result: "<text>" }）。
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.type === "result" && typeof m.result === "string" && m.result.trim()) {
      return m.result.trim();
    }
  }
  // 兜底：最后一条 assistant 消息的 text 内容。
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const content = m?.message?.content ?? m?.content;
    if (m?.type === "assistant" && Array.isArray(content)) {
      const text = content
        .filter((c) => c?.type === "text" && typeof c.text === "string")
        .map((c) => c.text)
        .join("\n")
        .trim();
      if (text) return text;
    }
  }
  return null;
}

/**
 * resume 被孤儿后台任务通知吞掉的特征（实测见 run 28591814073）：上一轮进程退出时
 * 还有后台子代理在跑，本次 `--resume` 启动后 CLI 先消费遗留的 task_notification，
 * 随即以 0 回合、空 result、origin.kind === "task-notification" 退出——用户的新消息
 * 完全没有跑模型。该通知被消费后，同 session 的下一次 resume 即恢复正常。
 */
export function isSwallowedResume(messages) {
  if (!Array.isArray(messages)) return false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.type !== "result") continue;
    return (
      m.num_turns === 0 &&
      !(typeof m.result === "string" && m.result.trim()) &&
      m.origin?.kind === "task-notification"
    );
  }
  return false;
}
