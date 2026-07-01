import { loadFeishuEnv } from "@infra/env/feishu";

/**
 * 一次性脚本：用 .env 里的 LARK_APP_ID / LARK_APP_SECRET 换 tenant_access_token，
 * 再调机器人信息接口打印 bot 的 open_id（ou_xxx）——填进 FEISHU_BOT_OPEN_ID 用。
 *
 *   npx tsx scripts/whoami.ts
 */

const { LARK_APP_ID: appId, LARK_APP_SECRET: appSecret, LARK_DOMAIN } = loadFeishuEnv();
if (!appId || !appSecret) {
  console.error("缺少 LARK_APP_ID / LARK_APP_SECRET（先填好 .env）");
  process.exit(1);
}

// 国际版 Lark 用 larksuite.com，国内飞书用 feishu.cn。
const base = LARK_DOMAIN === "Lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";

const tokenRes = (await fetch(`${base}/open-apis/auth/v3/tenant_access_token/internal`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
}).then((r) => r.json())) as { tenant_access_token?: string };

if (!tokenRes.tenant_access_token) {
  console.error("换 token 失败：", JSON.stringify(tokenRes));
  process.exit(1);
}

const info = (await fetch(`${base}/open-apis/bot/v3/info`, {
  headers: { Authorization: `Bearer ${tokenRes.tenant_access_token}` },
}).then((r) => r.json())) as { bot?: { open_id?: string; app_name?: string } };

const openId = info?.bot?.open_id;
if (!openId) {
  console.error("取 bot 信息失败：", JSON.stringify(info));
  process.exit(1);
}

console.log("");
console.log(`bot 名称   : ${info.bot?.app_name ?? "(未知)"}`);
console.log(`bot open_id: ${openId}`);
console.log("");
console.log("把下面这行填进 .env：");
console.log(`FEISHU_BOT_OPEN_ID=${openId}`);
