// 从 claude-code-action 的 execution_file 里抽出「最终回答文本」，打印到 stdout。
//
// 安全巡检 workflow 用它把 AI 巡检报告转成纯文本，再交给后续步骤开 issue / 推飞书。
// 解析/提取逻辑在 execution-result.mjs（与 feishu-reply.mjs 共用）；这里只负责
// 「读文件 + 取文本」，不碰任何网络。零第三方依赖，用 Node 全局 API。
//
// 读取环境变量：
//   EXECUTION_FILE   claude-code-action 的 execution_file 输出路径（可能为空 / 不存在）
//
// 约定：取不到文本时打印空串并以 0 退出——由调用方决定「无输出」如何处理，脚本本身不算失败。

import { readFileSync } from "node:fs";

import { extractResultText, parseMessages } from "./execution-result.mjs";

const executionFile = process.env.EXECUTION_FILE;
let text = "";
if (executionFile) {
  try {
    text = extractResultText(parseMessages(readFileSync(executionFile, "utf8"))) ?? "";
  } catch (err) {
    // 读文件失败不应让整条链路挂掉——打到 stderr，stdout 留空由调用方兜底。
    process.stderr.write(
      `[extract-result] 读取 execution_file 失败：${err instanceof Error ? err.message : err}\n`,
    );
  }
}

process.stdout.write(text);
