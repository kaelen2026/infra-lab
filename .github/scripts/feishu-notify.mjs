// 主动给一个飞书群 / 会话（chat_id）发一条 interactive 卡片消息。
//
// 与 feishu-reply.mjs 的区别：那个是「回帖到已有 thread」（需要 message_id），这个是
// 「主动发新消息到 chat_id」——安全巡检是定时触发，没有发起消息可回，所以走这条路。
// 由安全巡检 / 安全扫描 workflow 在有结果时调用。零依赖，用 Node 全局 fetch。
//
// 读取环境变量：
//   LARK_APP_ID / LARK_APP_SECRET  飞书应用凭证（换 tenant_access_token）
//   LARK_DOMAIN                    Feishu（默认，国内）/ Lark（国际）
//   FEISHU_CHAT_ID                 目标 chat_id（为空则跳过——飞书通知是可选增强，不配置不报错）
//   NOTIFY_TITLE                   卡片标题（可选）
//   NOTIFY_TEXT                    卡片正文 markdown（与 NOTIFY_FILE 二选一，优先 TEXT）
//   NOTIFY_FILE                    从文件读正文 markdown（NOTIFY_TEXT 为空时用）
//   NOTIFY_MENTION_OPEN_IDS        要 @ 的 open_id（逗号分隔,可选;卡片末尾追加 <at> 真实提醒,
//                                  负责人映射见 .github/security-owners.json）
//   RUN_URL                        本次 Actions 运行链接（附在正文尾部）

import { readFileSync } from "node:fs";

const appId = process.env.LARK_APP_ID;
const appSecret = process.env.LARK_APP_SECRET;
const chatId = process.env.FEISHU_CHAT_ID;
const title = process.env.NOTIFY_TITLE ?? "";
const runUrl = process.env.RUN_URL ?? "";

// 飞书 markdown 卡片单元素内容偏大时会被网关拒绝；截断到安全长度，尾部始终附运行链接。
const MAX_BODY_CHARS = 4000;

if (!chatId) {
  console.log("[feishu-notify] 无 FEISHU_CHAT_ID，跳过飞书通知（可选功能）");
  process.exit(0);
}
if (!appId || !appSecret) {
  // 配了 chat_id 却没有应用凭证，属于配置不完整——报错让维护者发现，而不是静默。
  console.error(
    "[feishu-notify] 缺少 LARK_APP_ID / LARK_APP_SECRET，无法发送（请在仓库 secrets 配置）",
  );
  process.exit(1);
}

const base =
  process.env.LARK_DOMAIN === "Lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";

function buildBody() {
  let text = process.env.NOTIFY_TEXT ?? "";
  if (!text && process.env.NOTIFY_FILE) {
    try {
      text = readFileSync(process.env.NOTIFY_FILE, "utf8");
    } catch (err) {
      console.warn(
        `[feishu-notify] 读取 NOTIFY_FILE 失败：${err instanceof Error ? err.message : err}`,
      );
    }
  }
  text = text.trim() || "安全巡检已运行，但没取到可展示的文本输出。";
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
      // 飞书 OpenAPI 业务错误码在 body.code；HTTP 5xx / 429 或 code!=0 时按可重试处理。
      if (res.ok && json.code === 0) return json;
      lastErr = `status=${res.status} code=${json.code} msg=${json.msg}`;
      const retriable = res.status >= 500 || res.status === 429;
      if (!retriable) throw new Error(`${label} 失败（不可重试）：${lastErr}`);
      console.warn(`[feishu-notify] ${label} 第 ${attempt + 1} 次失败，准备重试：${lastErr}`);
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      console.warn(`[feishu-notify] ${label} 第 ${attempt + 1} 次异常：${lastErr}`);
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

const elements = [{ tag: "markdown", content: buildBody() }];

// @ 指定负责人:卡片 markdown 的 <at id=open_id></at> 会触发真实的 @ 提醒(红点/加急面板),
// 不是纯文本。放在独立元素里,避免与正文截断逻辑互相影响。
const mentionIds = (process.env.NOTIFY_MENTION_OPEN_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (mentionIds.length > 0) {
  elements.push({
    tag: "markdown",
    content: `请关注:${mentionIds.map((id) => `<at id=${id}></at>`).join(" ")}`,
  });
}
const card = {
  schema: "2.0",
  ...(title ? { header: { title: { tag: "plain_text", content: title } } } : {}),
  body: { elements },
};

await fetchWithRetry(
  `${base}/open-apis/im/v1/messages?receive_id_type=chat_id`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: "interactive",
      content: JSON.stringify(card),
    }),
  },
  "发送飞书卡片",
);

console.log(`[feishu-notify] 已发送到 chat（chat_id=${chatId.slice(0, 8)}…）`);
