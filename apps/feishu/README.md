# @infra/feishu

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
event-router           总线卫生：回环过滤（丢 bot 自己的消息）+ 群聊必须 @ bot
   ▼
responder (LLM agent)  第0步强制 react（贴语境 emoji）→ 第1步强制 dispatch（写 notice）
   ▼
dispatcher             renderTask 翻译事件 → LocalTaskHandler
   ▼
bot-dispatch-handler   workflow_dispatch 触发 infra-lab-bot.yml（task 作为 prompt 输入）
```

接待 agent 用 AI SDK 的多步工具循环 + step gate，把「先 react、后 dispatch」做成运行时契约。
LLM 抛错 / 没配 / 没 dispatch 时降级：补默认 emoji + 固定 notice + 直接派发，保证消息不被吞。

## 跑起来

```bash
pnpm install
cp apps/feishu/.env.example apps/feishu/.env   # 填 LARK_* / FEISHU_BOT_OPEN_ID / INFRA_LAB_BOT_GITHUB_* / LLM_*
pnpm --filter @infra/feishu whoami             # 取 bot open_id，填进 .env 的 FEISHU_BOT_OPEN_ID
pnpm --filter @infra/feishu dev                # tsx watch 启动长连接
```

- `dev` — watch 模式启动（tsx，直接读 src 旁的 `prompt.md`）
- `build` — tsup 打包到 `dist/`（并把 `prompt.md` 复制到 `dist/`）
- `start` — `node dist/index.js`（先 `build`）
- `whoami` — 用 `LARK_APP_*` 换 token 打印 bot open_id
- `typecheck` / `test` — 跟随仓库统一门禁（`pnpm typecheck` / `pnpm test`）

`import "dotenv/config"` 从 `apps/feishu/` 目录加载 `.env`（与仓库根 `.env` 分开）。
纯出站长连接服务，不监听端口。

## 环境变量

见 `.env.example`。要点：

| 变量 | 说明 |
| --- | --- |
| `LARK_APP_ID` / `LARK_APP_SECRET` | 飞书应用凭证，入站长连接 + 出站 API 共用 |
| `FEISHU_BOT_OPEN_ID` | 群聊 @ 判断用的 bot open_id（`whoami` 获取） |
| `LARK_DOMAIN` | `Feishu`（国内，默认）/ `Lark`（国际） |
| `INFRA_LAB_BOT_GITHUB_TOKEN` | 触发 workflow_dispatch 的 GitHub token（必填） |
| `INFRA_LAB_BOT_GITHUB_REPO` | infra-lab-bot.yml 所在 `owner/repo`（必填） |
| `INFRA_LAB_BOT_GITHUB_REF` | 触发分支，默认 `main` |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | 接待 agent 的 LLM，缺任一则降级到固定 notice |

## 已知限制 / 后续

- **闭环回帖未接**：`infra-lab-bot.yml` 的 `workflow_dispatch` 目前只接受 `prompt`
  输入，且把 claude-code-action 的输出落到 Actions run 日志，**不会回到发起消息的
  飞书 thread**。要实现「bot 把结果回帖到飞书 thread」需扩展该 workflow（加 LARK
  secrets + 回帖步骤，并补 `thread_key` 等输入），属独立后续项。
- **无 Dockerfile**：原独立仓自带 tsx-runtime Dockerfile；迁入 monorepo 后容器化需
  pnpm workspace 感知的构建，暂未随迁，后续需要时再补。
