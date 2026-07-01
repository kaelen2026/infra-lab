import "dotenv/config";
import { createBotDispatchHandler } from "./bot-dispatch-handler";
import { setLocalTaskHandler } from "./feishu/dispatcher";
import { startFeishuWsClient } from "./feishu/ws-client";

// 入口：加载 .env → 装配处理 handler → 启动飞书事件长连接。
// 收到 im.message.receive_v1 后的链路：ws-client（去重/ack）→ event-router（回环/@ 准入）
// → responder（react → notice → dispatch）→ dispatcher → handler。

// 处理实现：workflow_dispatch 触发本仓库的 infra-lab-bot.yml（见 bot-dispatch-handler）。
// 需要 INFRA_LAB_BOT_GITHUB_TOKEN / INFRA_LAB_BOT_GITHUB_REPO。要换本地处理
// （队列 / 本地 LLM）改这一行即可（口子见 setLocalTaskHandler）。
setLocalTaskHandler(createBotDispatchHandler());

startFeishuWsClient();

// 守住进程：长连接靠 SDK 内部 socket 维持，主模块本身没有常驻句柄时不要退出。
process.on("SIGINT", () => {
  console.info("[feishu] 收到 SIGINT，退出");
  process.exit(0);
});
process.on("SIGTERM", () => {
  console.info("[feishu] 收到 SIGTERM，退出");
  process.exit(0);
});
