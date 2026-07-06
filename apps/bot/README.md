# @infra/bot

飞书 IM 接待 bot。长连接收消息 → 最快打个 emoji react → 回一句安抚 notice →
把任务 `workflow_dispatch` 派发到本仓库的 **infra-lab-bot** workflow
（`.github/workflows/infra-lab-bot.yml`）。bot 无 Postgres / Redis 依赖。

从 `lingowhale-feishu-bot` 迁入，派发目标由原 `niuma.yml` 改指向本仓库的
`infra-lab-bot.yml`。派发落点是 `LocalTaskHandler` 这个口子（`setLocalTaskHandler`），
要换本地 LLM / 队列 / 别的远端从这里换。

## 链路

```
飞书长连接 (ws-client)   收消息：LRU 去重 + fire-and-forget ack（避开飞书 3s 超时重推）
   ▼
event-router           总线卫生：回环过滤（丢 bot 自己的消息）+ 群聊准入
                       （@ bot，或 bot 参与过的话题内回复免 @ —— thread-tracker）
   ▼
responder (LLM agent)  第0步强制 react（贴语境 emoji）→ 第1步强制 dispatch（写 notice）
   ▼
dispatcher             renderTask 翻译事件 → LocalTaskHandler
   ▼
bot-dispatch-handler   workflow_dispatch 触发 infra-lab-bot.yml
                       （task→prompt、message_id→feishu_message_id、
                         threadKey→thread_key + session_uuid：话题多轮）
   ▼
infra-lab-bot.yml      claude-code-action 跑完 → feishu-reply.mjs 把结果回帖到原 thread（闭环）
```

接待 agent 用 AI SDK 的多步工具循环 + step gate，把「先 react、后 dispatch」做成运行时契约。
LLM 抛错 / 没配 / 没 dispatch 时降级：补默认 emoji + 固定 notice + 直接派发，保证消息不被吞。

## 跑起来

```bash
pnpm install
cp apps/bot/.env.example apps/bot/.env   # 填 LARK_* / FEISHU_BOT_OPEN_ID / INFRA_LAB_BOT_GITHUB_* / LLM_*
pnpm --filter @infra/bot whoami             # 取 bot open_id，填进 .env 的 FEISHU_BOT_OPEN_ID
pnpm --filter @infra/bot dev                # tsx watch 启动长连接
```

- `dev` — watch 模式启动（tsx，直接读 src 旁的 `prompt.md`）
- `build` — tsup 打包到 `dist/`（并把 `prompt.md` 复制到 `dist/`）
- `start` — `node dist/index.js`（先 `build`）
- `whoami` — 用 `LARK_APP_*` 换 token 打印 bot open_id
- `typecheck` / `test` — 跟随仓库统一门禁（`pnpm typecheck` / `pnpm test`）

`import "dotenv/config"` 从 `apps/bot/` 目录加载 `.env`（与仓库根 `.env` 分开）。
纯出站长连接服务，不监听端口。

## Docker

镜像用 `pnpm deploy` 产出自包含目录（prod `node_modules` + 已构建 `dist`）。
**构建上下文是仓库根**（要读 workspace 清单与 lockfile）：

```bash
docker build -f apps/bot/Dockerfile -t infra-bot .
docker run --rm --env-file apps/bot/.env infra-bot
```

App 私钥（方式 A）传给容器：用 `INFRA_LAB_BOT_PRIVATE_KEY`（PEM 内容，`\n` 转义）写进
`--env-file`，或挂载 .pem 并设 `INFRA_LAB_BOT_PRIVATE_KEY_PATH`
（`-v /host/key.pem:/key.pem:ro -e INFRA_LAB_BOT_PRIVATE_KEY_PATH=/key.pem`）。

## 派发鉴权（App 换发 token）

`bot-dispatch-handler` 触发 workflow 需要一枚能 `workflow_dispatch` 的 GitHub token。
默认以 **infra-lab-bot GitHub App** 身份换取并**自动续期** installation token
（`github-app-token.ts`）：签 JWT（`INFRA_LAB_BOT_CLIENT_ID` + 私钥）→ 查 installation →
换 scoped token（`actions:write`），进程内缓存、到期前自动刷新。App 需已授予该仓库
**Actions: read/write**。配了静态 `INFRA_LAB_BOT_GITHUB_TOKEN` 则跳过 App 换发（兜底 / 快测）。

以 App 身份派发时 actor 是 Bot，`infra-lab-bot.yml` 已 `allowed_bots: infra-lab-bot` 放行。

## 闭环回帖（飞书 ↔ infra-lab-bot）

`bot-dispatch-handler` 派发时把原消息 `message_id` 作为 `feishu_message_id` 输入传给
`infra-lab-bot.yml`；该 workflow 跑完后 `.github/scripts/feishu-reply.mjs` 用飞书
OpenAPI 把结果**回帖到同一 thread**（`reply_in_thread`）。

GitHub 侧需要仓库 **secrets `LARK_APP_ID` / `LARK_APP_SECRET`**（可选 var `LARK_DOMAIN`）。
人工 `gh workflow run infra-lab-bot.yml -f prompt="..."`（不带 `feishu_message_id`）不受影响，
回帖步骤自动跳过。

## 记录发起人（谁 @ 的 bot）

派发时把发起人透传给 workflow 供审计：`feishu_sender`（open_id）+ `feishu_sender_name`
（人名）作为 `workflow_dispatch` 输入，`infra-lab-bot.yml` 的 `run-name` 用它显示
「谁发起的」（优先姓名 → open_id → `github.actor`）。这样在 Actions run 列表里一眼能看到
每条自动运行是谁触发的（App 身份下 actor 恒为 bot，原本看不出）。

姓名由 `user-name.ts` 用 `LARK_APP_*` 出站 client 调 `contact.v3.user.get(open_id)` 解析，
进程内 LRU 缓存。**飞书应用需授予 `contact:user.base:readonly` 一类通讯录读权限**；未授权 /
解析失败一律降级回 open_id，**绝不阻断派发**。人工 `gh workflow run` 不带发起人输入，
`run-name` 自动降级为 `github.actor`。

## 环境变量

见 `.env.example`。要点：

| 变量 | 说明 |
| --- | --- |
| `LARK_APP_ID` / `LARK_APP_SECRET` | 飞书应用凭证，入站长连接 + 出站 API 共用 |
| `FEISHU_BOT_OPEN_ID` | 群聊 @ 判断用的 bot open_id（`whoami` 获取） |
| `LARK_DOMAIN` | `Feishu`（国内，默认）/ `Lark`（国际） |
| `INFRA_LAB_BOT_GITHUB_REPO` | infra-lab-bot.yml 所在 `owner/repo`（必填） |
| `INFRA_LAB_BOT_GITHUB_REF` | 触发分支，默认 `main` |
| `INFRA_LAB_BOT_CLIENT_ID` | 方式 A：App Client ID（换发 installation token） |
| `INFRA_LAB_BOT_PRIVATE_KEY` / `_PATH` | 方式 A：App 私钥（PEM 内容 / 或 .pem 路径） |
| `INFRA_LAB_BOT_GITHUB_TOKEN` | 方式 B：静态 token，配了则跳过 App 换发（兜底） |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | 接待 agent 的 LLM，缺任一则降级到固定 notice |

鉴权二选一，详见「派发鉴权」与 `.env.example`。

## 话题多轮（thread 免 @ + session 复用）

bot 回帖默认落在话题（`reply_in_thread`），用户顺着话题继续追问即可多轮对话，
不需要每条再 @：

- **触发**：群聊消息未 @ bot 但带 `root_id` 时，`thread-tracker` 拉一次话题 root 消息
  判定归属——root 是 bot 发的、或 root @ 过 bot → 放行；成员自己开的话题仍要求 @
  （避免把成员间讨论误当成对 bot 的请求，这是当年撤销「所有 thread 免 @」的教训）。
  判定结果按 root_id 做 LRU 缓存。
- **记忆**：`bot-dispatch-handler` 把 `threadKey`（root_id / 首条 message_id）作为
  `thread_key` 输入透传，并派生 `session_uuid = uuidv5(NAMESPACE, threadKey)`。
  `infra-lab-bot.yml` 用 thread_key 做 concurrency group 串行同话题 run（防止并发写坏
  session.jsonl），`actions/cache` 持久化 `~/.claude`，探测到 session 文件则
  `--resume`、否则 `--session-id` 首建——同一话题跨 run 共享 Claude Code 对话记忆。
- **权限依赖**：飞书应用必须开通 **`im:message.group_msg`（获取群组中所有消息）**。
  只有 `im:message.group_at_msg` 时，群里非 @ 消息（含话题内回复）根本不会推送到
  长连接，免 @ 放行无从谈起；`thread-tracker` 的 `message.get` 也依赖该读权限。

## 已知限制 / 后续

- **回帖为纯文本卡片**：结果以 markdown 卡片回到 thread，超长会截断并附运行日志链接；
  暂不回传图片 / 文件等富媒体。

## 部署 / CI-CD

bot 是一个**纯出站的长连接进程**（飞书 ws → GitHub `workflow_dispatch`），不是面向
浏览器的服务，因此**不在** [`deploy.yml`](../../.github/workflows/deploy.yml) 的免费服务层里
（那层是 web / h5 / api）。

- **质量门禁**：走仓库统一 CI（`lint · typecheck · build · test`）。
- **运行形态**：作为常驻进程运行——本地 `pnpm --filter @infra/bot dev`，或用容器
  （[`Dockerfile`](Dockerfile)）跑在任意能长期在线的主机上。`docker-compose.deploy.yml`
  里以 `--profile bot` 可选带起一份，用于单机验证。
- **它不适合 Cloudflare Workers**：Workers 是请求驱动、无常驻长连接，撑不住飞书 ws-client；
  需要一台常开的小实例（VM / 容器）。
- **配置**：飞书 `LARK_*`、派发用的 `INFRA_LAB_BOT_*`（GitHub App）、可选 `LLM_*` —— 见
  [`.env.deploy.example`](../../.env.deploy.example) 与「配置」小节；**绝不提交** secret。
