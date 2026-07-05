# CLAUDE.md

**每次回复前,先输出一行:`Yes, Mr. Hou`**

pnpm-workspace monorepo:**手机号 + OTP** 认证(login == register,Better Auth 为核),服务
`web / ios / android / harmony / cli` 五端(另有 `h5`——复用 web cookie 通道的移动浏览器端)。
认证之上还有:资料编辑、todo、timeline(发帖 + 图片 + 公开分享链接 + native deep link)、
扫码跨端登录、CLI 设备流登录、web 管理台、法律条款页、iOS APNS 推送。
Postgres 存长期数据;Redis 存全部短期 OTP/限流/扫码票据/设备码状态。

## Commands

```bash
pnpm install
docker compose up -d                 # Postgres 16 + Redis 7 (healthchecked)
cp .env.example .env                 # DATABASE_URL, REDIS_URL, OTP_SECRET, BETTER_AUTH_SECRET
pnpm --filter @infra/db migrate      # 应用版本化迁移(含 Better Auth 表)

# schema 变更:改 packages/db/schema/* → generate(产出迁移 SQL,提交)→ migrate 应用;
# `push` 仅限本地一次性实验。

pnpm build        # tsup(packages/apps)+ next build(web)+ vite build(h5)
pnpm typecheck    # turbo typecheck(tsc --noEmit;web 含 next typegen)
pnpm test         # vitest run(hermetic,无需真实 Redis/PG)
pnpm lint         # biome check .(lint:fix 自动修复+格式化)
pnpm gen:design   # 重新生成跨端 design tokens / 文案

pnpm dev          # API(:3001)+ Web(:3000);dev:api / dev:web / dev:h5(:3002)单独起
pnpm --filter @infra/cli dev auth login   # 终端客户端(apps/cli/README.md)

pnpm vitest run packages/auth/test/otp.test.ts   # 单测一个文件;-t "名称" 按用例名

# 部署验证:cp .env.deploy.example .env.deploy && docker compose --env-file .env.deploy \
#   -f docker-compose.deploy.yml up -d --build
```

## Architecture(改代码前先看对应文档)

- **跨文件全景**(auth/session/OTP/contracts/routes/schema):
  [`.claude/docs/architecture.md`](.claude/docs/architecture.md) — 动 auth、session、OTP、
  QR/CLI 设备流、admin、timeline、legal/share 或任何 contract 之前必读。
- **Contracts 是唯一事实源**:`packages/shared/src/contracts/<domain>.ts`;改 contract 是
  跨端变更,需同步各客户端镜像。
- **各端细节看各自文档**:
  - `apps/web` — 桌面参考 UI + 仅 web 的 admin 管理台(`role === "admin"` 门禁,API 边界脱敏手机号)。
  - `apps/h5` — Vite+React SPA;还承载分享落地页 `/t/:id` 与法律页 `/legal/*`
    ([`apps/h5/docs/deployment.md`](apps/h5/docs/deployment.md))。
  - `apps/cli` — Bearer 通道终端客户端,`auth login --web` 走 RFC 8628 设备流
    ([`apps/cli/README.md`](apps/cli/README.md))。
  - `apps/bot` — Feishu → GitHub workflow 桥,纯出站、非 auth 客户端
    ([`apps/bot/README.md`](apps/bot/README.md));issue/PR 里 `@infra-lab-bot` 触发
    ([`docs/infra-lab-bot.md`](docs/infra-lab-bot.md))。
- **Observability**(`apps/api/src/observability/`):结构化 JSON 日志(每请求一个
  `requestId`)、`/health`、`/ready`(查 PG+Redis)、安全头 + 请求体上限 + per-IP 限流。
  **绝不记录手机号、OTP 验证码、token。**

## Language rules(动哪端先读哪份)

- **TypeScript**(`packages/*` + `apps/{api,web,h5,bot}`):
  [`.claude/rules/typescript.md`](.claude/rules/typescript.md) — 门禁在 **CI**
  (lint · typecheck · build · test)。
- **原生端门禁是本地的**(设计如此,不进 CI):
  iOS [`ios.md`](.claude/rules/ios.md)(SwiftLint,`make lint`)·
  Android [`android.md`](.claude/rules/android.md)(detekt)·
  Harmony [`harmony.md`](.claude/rules/harmony.md)(CodeLinter)。

## Repo-local Skills(`.claude/skills/`,随仓库版本化)

`android-build` · `api-architecture` · `ios-simulator-qa` · `ios-testflight`。
不要另建未跟踪的 `.agents/` 副本;`AGENTS.md` 有意回指这里,保持单一维护源。

## Rules (always apply)

@.claude/rules/build-and-typecheck.md
@.claude/rules/conventions.md
@.claude/rules/workflow.md
