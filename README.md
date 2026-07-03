# infra-lab

[![CI](https://github.com/kaelen/infra-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/kaelen/infra-lab/actions/workflows/ci.yml)

手机号 + 验证码的注册/登录系统。**登录即注册**，认证核心使用 [Better Auth](https://www.better-auth.com/)，
一套后端服务 **Web / iOS / Android / HarmonyOS / CLI** 五端（另有移动端 **H5**，作为浏览器客户端复用
Web 的 Cookie 传输）。五端共享同一套 `AuthClient` 契约与 `@infra/sdk` 参考实现，仅传输与安全存储不同。

在认证之上还落了几个业务/体验特性：**待办（Todo）**、**朋友圈式时间线（Timeline，含图片上传与公开分享
链接）**、**扫码跨端登录（QR）**、**CLI 浏览器辅助登录（device flow）**、**iOS APNS 推送**。

- **Postgres 16** 存长期数据：Better Auth 核心表（`user` `session` `account` `verification`）+ 业务表
  `profile` `device` `refresh_token` `login_event` `todo` `timeline_post`
- **Redis 7** 存短期数据：验证码哈希、错误次数、发送冷却、限流、锁定、扫码 ticket、CLI device code
- pnpm workspace monorepo · TypeScript ESM · Hono(API) · Next.js(Web) · Vite+React(H5) · Drizzle(ORM)

## 认证规则

| 规则 | 取值 |
|------|------|
| 验证码 | 6 位数字，TTL 5 分钟，**只在 Redis 存 HMAC-SHA256 哈希**（不存明文） |
| 重发冷却 | 同号 60 秒内不可重复发送 |
| 每日上限 | 同号每日最多 10 次 |
| IP 限流 | 同 IP 每小时最多 30 次 |
| 锁定 | 连续错误 5 次 → 锁定 10 分钟 |
| 单次使用 | 验证通过后立即删除 Redis 中的 otp 与 attempt |
| 自动建号 | 新手机号验证成功 → 事务创建 `user` + `profile` |

会话按端区分：

- **Web** → HttpOnly Cookie（`infra.session`），前端不接触任何 token
- **iOS / Android / HarmonyOS / CLI** → Bearer `accessToken`（15 分钟）+ `refreshToken`（30 天，库中仅存哈希、刷新时轮转、旧 token 立即失效）；CLI 走同一条 native 通道，把 Keychain/Keystore/HUKS 换成一份 `0600` 的本地凭据文件
- `requireUser` 同时支持 Cookie 与 Bearer

## 快速开始

```bash
pnpm install
cp .env.example .env                 # 配置 DATABASE_URL / REDIS_URL / OTP_SECRET / BETTER_AUTH_SECRET
docker compose up -d                 # Postgres 16 + Redis 7（含 healthcheck）
pnpm build
pnpm --filter @infra/db migrate      # 应用版本化迁移（建全部表，含 Better Auth 所需的表）

pnpm dev                             # API → :3001 + Web → :3000（单启：pnpm dev:api / pnpm dev:web / pnpm dev:h5 → :3002）
```

> 终端客户端：`pnpm --filter @infra/cli dev auth login`（详见 [`apps/cli/README.md`](./apps/cli/README.md)）。
> 飞书接待 bot 与 CLI 不在 `pnpm dev` 聚合内，需单独启动（`pnpm --filter @infra/bot dev`）。

> 本地联调时把 `.env` 里的 `OTP_DEBUG_RETURN_CODE=true`，`/auth/otp/request` 会在响应里回显验证码（**仅限开发，生产必须关闭**，验证码只经短信网关下发）。

## 常用命令

```bash
pnpm build        # 构建（tsup 各包 + next build；按依赖拓扑顺序）
pnpm test         # vitest，纯内存测试，无需真实 Redis/Postgres
pnpm typecheck    # 各包 tsc --noEmit
pnpm lint         # biome 检查（pnpm lint:fix 自动修复 + 格式化）
pnpm knip         # 本地死代码检查（未使用的文件/依赖/导出）；不进 CI，输出仅供参考
                  # 结果是启发式的：动态引用的导出可能被误报，删除前需人工确认

# 单个测试
pnpm vitest run packages/auth/test/otp.test.ts
pnpm vitest run -t "locks the phone"

node scripts/verify-redis.mjs        # 针对运行中的 Redis 跑验收断言（需先 build）
```

## 目录结构

```
packages/
  shared/   契约单一真相：Zod schema、DTO、错误码、限值、路由常量、Platform 枚举、Auth/Todo/Timeline Client 接口
  auth/     OTP 领域服务（定义 OtpStore 端口）、require-user、Better Auth 集成；testing 导出 FakeRedis
  redis/    OtpStore 的 ioredis 适配器（依赖 @infra/auth 的类型）
  db/       Drizzle schema（schema/{auth,todo,timeline}.ts + schema/index.ts 桶）+ 客户端 + drizzle.config
  sdk/      各端共用的 JS 参考实现：createAuthClient / createTodoClient / createTimelineClient / createWebQrLoginClient；re-export @infra/shared
  design/   设计令牌单一来源：pnpm gen:design 生成各端颜色/文案（web/h5 CSS、iOS/Android/Harmony 代码），CI 校验无漂移
  env/      环境变量 Zod 校验与加载（core：DB/Redis/OTP/Cookie/APNS…）
apps/
  api/      Hono 路由（auth：otp/refresh/logout/me/devices/push-token/login-events/qr/cli；todo/timeline：CRUD；notifications：dev 自推）
            + user/todo/timeline repository + session-service + APNS client + observability（结构化日志 / request-id / 健康探针）
  web/      Next.js：登录页（app/auth）、账户面板（app/page）、待办（app/todos）、时间线（app/timeline）
  h5/       移动端 H5（Vite + React 19 + Tailwind v4 SPA，:3002）：复用 @infra/sdk 的 Web Cookie 传输，
            移动优先的登录 + 账户 + 待办 + 时间线；部署见 apps/h5/docs/deployment.md
  ios/      Swift/SwiftUI；android/ Kotlin/Compose；harmony/ ArkTS：三个原生端，Bearer 通道 + 平台安全存储
  cli/      终端客户端（@infra/cli，bin: infra-lab）：手机号+OTP 登录 / 浏览器 device flow，会话持久化到本地凭据文件；见 apps/cli/README.md
  bot/      飞书 IM 接待 bot：长连接收消息 → react → 安抚 notice → 派发到 infra-lab-bot workflow（无 PG/Redis）
docs/plans/phone-otp-auth-plan.md      设计方案 + 各端 SDK 接口草案
docs/plans/cli-plan.md                 CLI 设计与 device flow 安全要点
.ai/verifications/phone-otp-auth.md    验收记录（命令 + 实跑输出）
```

**架构要点（端口-适配器）**：`@infra/auth` 的 OTP 领域只依赖一个最小 `OtpStore` 端口，不 import 任何
Redis 驱动；`@infra/redis` 实现该端口（因此是 redis 依赖 auth，而非反向）。`createOtpService` /
`createAuthRoutes` / `createSessionService` / `createUserRepository` / `createTodoRoutes` / `createTimelineRoutes`
均通过参数注入依赖，测试用 `FakeRedis` 与内存仓储即可全程脱离外部服务。Redis OTP service 是验证码与限流的
**唯一权威**，Better Auth 负责身份模型（Drizzle 适配器 + `bearer()` 插件）与会话解析。跨文件的更完整架构说明
见 [`.claude/docs/architecture.md`](.claude/docs/architecture.md)。

## HTTP 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/otp/request` | 发送验证码 `{ phone, platform }` |
| POST | `/auth/otp/verify`  | 校验并登录/注册 `{ phone, code, platform, device? }` |
| POST | `/auth/refresh`     | 轮转刷新 token（原生端）`{ refreshToken }` |
| POST | `/auth/logout`      | 登出 |
| GET  | `/auth/me`          | 当前用户（Cookie 或 Bearer） |
| GET  | `/auth/devices`     | 账户面板：本人设备列表（最近在前） |
| POST | `/auth/devices/push-token` | 上报本机 APNS push token（供推送定向到本人 iOS 设备） |
| GET  | `/auth/login-events`| 账户面板：本人最近登录记录（新→旧） |

**扫码跨端登录（QR）**——已登录的原生端批准浏览器登录：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/qr/create`  | 浏览器创建 ticket（Redis，TTL 120s），返回 `ticketId`（渲染二维码）+ 保密 `pollToken` |
| POST | `/auth/qr/approve` | 原生端扫码后批准（自身 Cookie/Bearer 绑定用户） |
| GET  | `/auth/qr/status`  | 浏览器轮询（以 `pollToken` 证明所有权），`approved` 后可消费 |
| POST | `/auth/qr/consume` | 消费单次 ticket，换取与 OTP web 流程同款的 HttpOnly 会话 Cookie |

**CLI 浏览器辅助登录（device flow，RFC 8628 风格）**：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/cli/device`         | CLI（未登录）领取保密 `deviceCode` + 人读 `userCode` + 待打开页面 |
| POST | `/auth/cli/device/token`   | CLI 以 `deviceCode` 轮询；待批准返回状态、批准后**单次**发放 Bearer + refresh |
| POST | `/auth/cli/device/approve` | 浏览器携本人会话 Cookie（SameSite=Lax）批准/拒绝，绑定用户；不向浏览器返回任何 token |

**待办（Todo）**——受保护，`userId` 隔离：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET    | `/todos`      | 列出当前用户的待办（新→旧） |
| POST   | `/todos`      | 新建待办 `{ title }` → `201` |
| PATCH / PUT | `/todos/:id`  | 更新待办 `{ title?, completed? }`（切换完成时同步 `completedAt`；PUT 供无 PATCH 的 Harmony NetworkKit 使用） |
| DELETE | `/todos/:id`  | 删除待办 |

**时间线（Timeline）**——受保护，`userId` 隔离；图片存本地磁盘、`images` 存相对 URL：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET    | `/timeline`          | keyset 分页列出本人动态（新→旧） |
| POST   | `/timeline`          | 发布动态 `{ text?, images? }` |
| POST   | `/timeline/images`   | 上传图片（校验类型与大小 → 返回 URL） |
| GET    | `/timeline/share/:id`| 公开分享单条（不鉴权，不可猜的 id 即凭证） |
| DELETE | `/timeline/:id`      | 删除本人动态 |
| GET    | `/uploads/:name`     | 回源已上传的图片字节 |

**推送（可选，dev-only）**：`POST /notifications/test` 给本人 iOS 设备自推一条测试通知，用于端到端验证 APNS
链路——**仅当配置了 `APNS_*` 且开启 dev 标记时才挂载**，生产不暴露。

`/todos*`、`/timeline*`（除 `share`）与账户面板端点全部受保护，复用会话解析（Cookie 或 Bearer）；
未登录 → `401 UNAUTHORIZED`，访问不存在或非本人的资源 → `404`（`TODO_NOT_FOUND` / `TIMELINE_POST_NOT_FOUND`）。

错误码与状态映射：冷却/限流 → `429`，锁定 → `423`，验证码错误/过期/未授权 → `401`，
资源未找到 → `404`，QR ticket 已用/未批准 → `409`，图片过大 → `413`、图片类型不支持 → `415`，参数非法 → `400`。

## 可观测性

API 输出结构化 JSON 日志（每条带 `requestId`，`x-request-id` 支持透传），并暴露两个探针：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 存活探针：进程存活即 `200`，不调用任何依赖 |
| GET | `/ready`  | 就绪探针：探测 Postgres + Redis，任一不可用 → `503`；外部 uptime 探测指向这里 |

未捕获异常经集中错误处理记录（堆栈 + `requestId`），对外只返回通用 `500`，不泄露内部细节；
日志绝不落手机号 / 验证码 / token。代码在 `apps/api/src/observability/`。

## 环境变量

见 [`.env.example`](./.env.example)。关键项：`DATABASE_URL`、`REDIS_URL`、`OTP_SECRET`（验证码哈希密钥）、
`BETTER_AUTH_SECRET`（会话签名）、`COOKIE_SECURE`/`COOKIE_DOMAIN`、`OTP_DEBUG_RETURN_CODE`。
另有可选 `LOG_LEVEL`（API 日志级别，默认 `info`）与 iOS 推送用的 `APNS_*`（`APNS_KEY_ID` / `APNS_TEAM_ID` /
`APNS_BUNDLE_ID` + `APNS_PRIVATE_KEY` 或 `APNS_PRIVATE_KEY_PATH` 二选一 / `APNS_PRODUCTION`；不配置则推送不挂载）。
CLI 侧另认 `INFRA_LAB_API_URL`（API 基址）与 `XDG_CONFIG_HOME`（凭据目录），见 [`apps/cli/README.md`](./apps/cli/README.md)。

## 工程约定

- 构建用 **tsup**（基础 tsconfig 为 `noEmit`），**不要运行 `tsc -b`**——会把产物写进源码目录。
- 提交遵循 **Conventional Commits**：`pre-commit` 跑 lint-staged（Biome），`commit-msg` 由 commitlint 校验。
- 原生端（iOS / Android / HarmonyOS）各有本地编码规范 + lint 门禁（SwiftLint / detekt / DevEco CodeLinter），
  改动前先读 `.claude/rules/{ios,android,harmony}.md`；这些门禁本地运行，不进 CI（详见 [`CLAUDE.md`](./CLAUDE.md)）。
- 详尽的开发须知见 [`CLAUDE.md`](./CLAUDE.md)。
- 仓库配有 AI 助手 **infra-lab-bot**（`@infra-lab-bot` 提及即用）——协作方式见 [`docs/infra-lab-bot.md`](./docs/infra-lab-bot.md)；
  飞书用户可经 `apps/bot` 接待 bot 触达同一 workflow。
```
