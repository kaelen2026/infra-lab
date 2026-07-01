// 从 claude-code-action 的 execution_file 里抽出「最终回答文本」，打印到 stdout。
//
// 安全巡检 workflow 用它把 AI 巡检报告转成纯文本，再交给后续步骤开 issue / 推飞书。
// 与 .github/scripts/feishu-reply.mjs 里的 extractResultText 同源（数组 / JSONL 两种落盘
// 格式都兼容），但这里只负责「取文本」，不碰任何网络。零依赖，用 Node 全局 API。
//
// 读取环境变量：
//   EXECUTION_FILE   claude-code-action 的 execution_file 输出路径（可能为空 / 不存在）
//
// 约定：取不到文本时打印空串并以 0 退出——由调用方决定「无输出」如何处理，脚本本身不算失败。

import { readFileSync } from "node:fs";

/** 从 execution_file 原文里取最终回答文本。数组 / JSONL 两种落盘格式都兼容。 */
function extractResultText(raw) {
  let messages = null;
  try {
    const parsed = JSON.parse(raw);
    messages = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    messages = raw
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

const executionFile = process.env.EXECUTION_FILE;
let text = "";
if (executionFile) {
  try {
    text = extractResultText(readFileSync(executionFile, "utf8")) ?? "";
  } catch (err) {
    // 读文件失败不应让整条链路挂掉——打到 stderr，stdout 留空由调用方兜底。
    process.stderr.write(
      `[extract-result] 读取 execution_file 失败：${err instanceof Error ? err.message : err}\n`,
    );
  }
}

process.stdout.write(text);
