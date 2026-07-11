# CLAUDE.md

**每次回复前,先输出一行:`Yes, Mr. Hou`**

pnpm-workspace monorepo:**手机号 + OTP** 认证(login == register,Better Auth 为核),服务
`web / ios / android / harmony / cli` 五端(另有 `h5`——复用 web cookie 通道的移动浏览器端;
`miniprogram`——微信小程序端,`platform=weapp`,复用 @infra/sdk 走 cli 同款 Bearer 通道)。
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
  - `apps/miniprogram` — 微信小程序端(`platform=weapp`)。复用 @infra/sdk,传输走
    `wx.request`、token 存 wx storage;tsup 把 @infra/sdk 内联进 `miniprogram/` 产物,
    绕开 构建 npm。质量门禁:typecheck + wx-fetch 单测进 CI,小程序构建/预览本地(微信开发者
    工具),同原生端 ([`apps/miniprogram/README.md`](apps/miniprogram/README.md))。
  - `apps/bot` — Feishu → GitHub workflow 桥,纯出站、非 auth 客户端
    ([`apps/bot/README.md`](apps/bot/README.md));issue/PR 里 `@infra-lab-bot` 触发
    ([`docs/infra-lab-bot.md`](docs/infra-lab-bot.md))。
- **Observability**(`apps/api/src/observability/`):结构化 JSON 日志(每请求一个
  `requestId`)、`/health`、`/ready`(查 PG+Redis;排水时 503)、`/metrics`(Prometheus
  文本格式,按 method/路由模式/status 计数 + 延迟直方图)、安全头 + 请求体上限 +
  per-IP 限流、优雅关闭(超时强退兜底 + 全局异常处理)。
  **绝不记录手机号、OTP 验证码、token。**

## Language rules(动哪端先读哪份)

- **TypeScript**(`packages/*` + `apps/{api,web,h5,bot}`):
  [`.claude/rules/typescript.md`](.claude/rules/typescript.md) — 门禁在 **CI**
  (lint · typecheck · build · test)。
- **原生端门禁是本地的**(设计如此,不进 CI):
  iOS [`ios.md`](.claude/rules/ios.md)(SwiftLint,`make lint`)·
  Android [`android.md`](.claude/rules/android.md)(detekt)·
  Harmony [`harmony.md`](.claude/rules/harmony.md)(CodeLinter)。

## 工作模式:主 agent 编排 + 任务 subagent(默认)

**主 agent 只做编排,不把所有活儿在自己身上串行干完。** 一个完整的 loop 由
`.claude/agents/` 里的任务 subagent 分工完成,**每一步都有可验证的标准**(客观门禁通过、
契约一致、验收条件明确),而不是"看起来对就收尾"。

- **explorer**(只读侦察)→ 测绘改动面:要动哪些文件、涉及哪些 contract/端、守哪些不变量。
- **implementer(按端拆分,主 agent 按改动落点路由)**→ 用 **TDD**(red→green→refactor)落地一个
  边界清晰的子任务,严守**对应端** rule 与 contracts 单一事实源:
  - **ts-implementer** — `packages/*` + `apps/{api,web,h5,bot,cli,miniprogram}`,门禁是 CI 四关。
  - **ios-implementer** — `apps/ios`(Swift/SwiftUI),门禁本地 `make lint`(SwiftLint)。
  - **android-implementer** — `apps/android`(Kotlin/Compose),门禁本地 `./gradlew detekt`。
  - **harmony-implementer** — `apps/harmony`(ArkTS),门禁本地 `codelinter`。
  - 一次改 contract 会波及多端 → 主 agent 一条消息并发派发对应端 implementer 同步各自镜像。
- **verifier**(验证)→ **真跑** CI 同款门禁(`lint·typecheck·build·test`)给 PASS/FAIL;不改码。
- **reviewer**(对抗式评审)→ 合入前审 diff 的仓库红线(密钥/分层/契约漂移/force-unwrap…)。

编排原则:独立子任务一条消息并发派发(fan-out),有依赖的按 explorer→plan→implement→
verify→review 流水;主 agent 保留**结论**而非文件堆。需要更大规模(多轮 fan-out + 对抗式
验证 + 综合)且用户明确要 workflow 时,才上 Workflow 工具。改动仍走特性分支 + PR + CI
(见 [`workflow.md`](.claude/rules/workflow.md))。

**loop 自己驱动到底,不在每个 gate 停下等确认。** 接到一个任务就把它当一整个 loop 跑完
(explorer→implement→verify→review→建分支→commit→PR),中途**不为"要不要继续下一步"回来
问**;只在两种时刻才停下找用户:(1)**决策分叉**——需求有歧义、多个合理方案要选、要动
不可逆/对外的动作(删数据、发布上线、`git push --force`);(2)**最终结果**——任务完成或
遇到自己无法推进的阻塞。gate 失败(verifier FAIL / reviewer 报红线)是 loop 内部事件:自己
派对应端 implementer 返工再验,不必回来请示。此自治**不豁免**既有纪律——仍**禁止在 `main`
直接提交**(先建特性分支),仍走 PR + CI 门禁,仍遵守各端 rule 与 contracts 单一事实源。

## Repo-local Skills(`.claude/skills/`,随仓库版本化)

`android-build` · `api-architecture` · `deploy` · `ios-simulator-qa` · `ios-testflight`。
不要另建未跟踪的 `.agents/` 副本;`AGENTS.md` 有意回指这里,保持单一维护源。

## Rules (always apply)

@.claude/rules/build-and-typecheck.md
@.claude/rules/conventions.md
@.claude/rules/workflow.md
