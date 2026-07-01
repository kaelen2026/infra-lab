# infra-lab

[![CI](https://github.com/kaelen/infra-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/kaelen/infra-lab/actions/workflows/ci.yml)

手机号 + 验证码的注册/登录系统。**登录即注册**，认证核心使用 [Better Auth](https://www.better-auth.com/)，
一套后端服务 **Web / iOS / Android / HarmonyOS** 四端。

- **Postgres 16** 存长期数据：`user` `profile` `device` `refresh_token` `login_event`
- **Redis 7** 存短期数据：验证码哈希、错误次数、发送冷却、限流、锁定
- pnpm workspace monorepo · TypeScript ESM · Hono(API) · Next.js(Web) · Drizzle(ORM)

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
- **iOS / Android / HarmonyOS** → Bearer `accessToken`（15 分钟）+ `refreshToken`（30 天，库中仅存哈希、刷新时轮转、旧 token 立即失效）
- `requireUser` 同时支持 Cookie 与 Bearer

## 快速开始

```bash
pnpm install
cp .env.example .env                 # 配置 DATABASE_URL / REDIS_URL / OTP_SECRET / BETTER_AUTH_SECRET
docker compose up -d                 # Postgres 16 + Redis 7（含 healthcheck）
pnpm build
pnpm --filter @infra/db push         # 建表（含 Better Auth 所需的表）

pnpm --filter @infra/api dev         # API → http://localhost:3001
pnpm --filter @infra/web dev         # Web → http://localhost:3000
```

> 本地联调时把 `.env` 里的 `OTP_DEBUG_RETURN_CODE=true`，`/auth/otp/request` 会在响应里回显验证码（**仅限开发，生产必须关闭**，验证码只经短信网关下发）。

## 常用命令

```bash
pnpm build        # 构建（tsup 各包 + next build；按依赖拓扑顺序）
pnpm test         # vitest，纯内存测试，无需真实 Redis/Postgres
pnpm typecheck    # 各包 tsc --noEmit
pnpm lint         # biome 检查（pnpm lint:fix 自动修复 + 格式化）

# 单个测试
pnpm vitest run packages/auth/test/otp.test.ts
pnpm vitest run -t "locks the phone"

node scripts/verify-redis.mjs        # 针对运行中的 Redis 跑验收断言（需先 build）
```

## 目录结构

```
packages/
  shared/   契约单一真相：Zod schema、DTO、错误码、限值、路由常量、Auth/Todo Client 接口 + JS 参考实现
  auth/     OTP 领域服务（定义 OtpStore 端口）、require-user、Better Auth 集成；testing 导出 FakeRedis
  redis/    OtpStore 的 ioredis 适配器（依赖 @infra/auth 的类型）
  db/       Drizzle schema（schema/{auth,todo}.ts + schema/index.ts 桶）+ 客户端 + drizzle.config
apps/
  api/      Hono 路由（auth：otp/refresh/logout/me；todo：CRUD）+ user/todo repository + session-service
  web/      Next.js：手机号验证码登录页（app/auth）、账户面板（app/page）、待办（app/todos + features/todos）
docs/plans/phone-otp-auth-plan.md      设计方案 + 四端 SDK 接口草案
.ai/verifications/phone-otp-auth.md    验收记录（命令 + 实跑输出）
```

**架构要点（端口-适配器）**：`@infra/auth` 的 OTP 领域只依赖一个最小 `OtpStore` 端口，不 import 任何
Redis 驱动；`@infra/redis` 实现该端口（因此是 redis 依赖 auth，而非反向）。`createOtpService` /
`createAuthRoutes` / `createSessionService` / `createUserRepository` 均通过参数注入依赖，测试用 `FakeRedis`
与内存仓储即可全程脱离外部服务。Redis OTP service 是验证码与限流的**唯一权威**，Better Auth 负责身份模型
（Drizzle 适配器 + `bearer()` 插件）与会话解析。

## HTTP 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/otp/request` | 发送验证码 `{ phone, platform }` |
| POST | `/auth/otp/verify`  | 校验并登录/注册 `{ phone, code, platform, device? }` |
| POST | `/auth/refresh`     | 轮转刷新 token（原生端）`{ refreshToken }` |
| POST | `/auth/logout`      | 登出 |
| GET  | `/auth/me`          | 当前用户（Cookie 或 Bearer） |
| GET    | `/todos`      | 列出当前用户的待办（按 `userId` 隔离，新→旧） |
| POST   | `/todos`      | 新建待办 `{ title }` → `201` |
| PATCH  | `/todos/:id`  | 更新待办 `{ title?, completed? }`（切换完成时同步 `completedAt`） |
| DELETE | `/todos/:id`  | 删除待办 |

`/todos*` 全部受保护，复用会话解析（Cookie 或 Bearer）；未登录 → `401 UNAUTHORIZED`，
访问不存在或非本人的待办 → `404 TODO_NOT_FOUND`。

错误码与状态映射：冷却/限流 → `429`，锁定 → `423`，验证码错误/过期/未授权 → `401`，
待办未找到 → `404`，参数非法 → `400`。

## 环境变量

见 [`.env.example`](./.env.example)。关键项：`DATABASE_URL`、`REDIS_URL`、`OTP_SECRET`（验证码哈希密钥）、
`BETTER_AUTH_SECRET`（会话签名）、`COOKIE_SECURE`/`COOKIE_DOMAIN`、`OTP_DEBUG_RETURN_CODE`。

## 工程约定

- 构建用 **tsup**（基础 tsconfig 为 `noEmit`），**不要运行 `tsc -b`**——会把产物写进源码目录。
- 提交遵循 **Conventional Commits**：`pre-commit` 跑 lint-staged（Biome），`commit-msg` 由 commitlint 校验。
- 详尽的开发须知见 [`CLAUDE.md`](./CLAUDE.md)。
```
