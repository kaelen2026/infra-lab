// 把 infra-lab-bot 这次运行的最终文本回帖到发起消息所在的飞书 thread，闭合
// 「飞书 @ → 派发 workflow → 结果回到飞书」这条链路。
//
// 由 .github/workflows/infra-lab-bot.yml 在 claude-code-action 之后调用（仅
// workflow_dispatch 且带 feishu_message_id 时）。零依赖，用 Node 全局 fetch。
//
// 读取环境变量：
//   LARK_APP_ID / LARK_APP_SECRET  飞书应用凭证（换 tenant_access_token）
//   LARK_DOMAIN                    Feishu（默认，国内）/ Lark（国际）
//   FEISHU_MESSAGE_ID              要回复的原消息 id（reply_in_thread 落到其 thread）
//   EXECUTION_FILE                 claude-code-action 的 execution_file 输出路径（可能为空）
//   RUN_URL                        本次 Actions 运行链接（footer + 兜底文案用）

import { readFileSync } from "node:fs";

const appId = process.env.LARK_APP_ID;
const appSecret = process.env.LARK_APP_SECRET;
const messageId = process.env.FEISHU_MESSAGE_ID;
const executionFile = process.env.EXECUTION_FILE;
const runUrl = process.env.RUN_URL ?? "";

if (!messageId) {
  console.log("[feishu-reply] 无 FEISHU_MESSAGE_ID，跳过");
  process.exit(0);
}
if (!appId || !appSecret) {
  console.error(
    "[feishu-reply] 缺少 LARK_APP_ID / LARK_APP_SECRET，无法回帖（请在仓库 secrets 配置）",
  );
  process.exit(1);
}

const base =
  process.env.LARK_DOMAIN === "Lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";

// 飞书 markdown 卡片单元素内容偏大时会被网关拒绝；截断到安全长度，尾部始终附运行链接。
const MAX_BODY_CHARS = 4000;

/** 从 claude-code-action 的 execution_file 里取最终回答文本。数组 / JSONL 两种落盘格式都兼容。 */
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

function buildBody() {
  let text = null;
  if (executionFile) {
    try {
      text = extractResultText(readFileSync(executionFile, "utf8"));
    } catch (err) {
      console.warn(
        `[feishu-reply] 读取 execution_file 失败：${err instanceof Error ? err.message : err}`,
      );
    }
  }
  if (!text) {
    // Claude 步骤失败 / 没有可解析输出时的兜底：至少让 thread 里的人知道任务已结束。
    text = "任务已结束，但没取到可回帖的文本输出。";
  }
  if (text.length > MAX_BODY_CHARS) {
    text = `${text.slice(0, MAX_BODY_CHARS)}\n\n…（输出过长已截断）`;
  }
  return runUrl ? `${text}\n\n---\n完整输出见 [Actions 运行日志](${runUrl})` : text;
}

async function fetchWithRetry(url, init, label) {
  const backoff = [0, 800, 2000];
  let lastErr = "";
  for (let attempt = 0; attempt < backoff.length; attempt++) {
    if (backoff[attempt] > 0) await new Promise((r) => setTimeout(r, backoff[attempt]));
    try {
      const res = await fetch(url, init);
      const json = await res.json().catch(() => ({}));
      // 飞书 OpenAPI 业务错误码在 body.code；HTTP 5xx / code!=0 且非明确 4xx 语义时重试。
      if (res.ok && json.code === 0) return json;
      lastErr = `status=${res.status} code=${json.code} msg=${json.msg}`;
      const retriable = res.status >= 500 || res.status === 429;
      if (!retriable) throw new Error(`${label} 失败（不可重试）：${lastErr}`);
      console.warn(`[feishu-reply] ${label} 第 ${attempt + 1} 次失败，准备重试：${lastErr}`);
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      console.warn(`[feishu-reply] ${label} 第 ${attempt + 1} 次异常：${lastErr}`);
    }
  }
  throw new Error(`${label} 重试耗尽：${lastErr}`);
}

const tokenJson = await fetchWithRetry(
  `${base}/open-apis/auth/v3/tenant_access_token/internal`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  },
  "换 tenant_access_token",
);
const token = tokenJson.tenant_access_token;

const card = {
  schema: "2.0",
  body: { elements: [{ tag: "markdown", content: buildBody() }] },
};

await fetchWithRetry(
  `${base}/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      msg_type: "interactive",
      content: JSON.stringify(card),
      reply_in_thread: true,
    }),
  },
  "回帖到飞书 thread",
);

console.log(`[feishu-reply] 已回帖到 thread（message_id=${messageId.slice(0, 8)}…）`);
