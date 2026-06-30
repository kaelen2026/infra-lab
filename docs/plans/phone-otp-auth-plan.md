# 手机号 + 验证码认证系统 — 实施方案

> 默认且唯一的注册/登录方式为「手机号 + 验证码」。认证核心使用 **Better Auth**，
> 支持 **Web / iOS / Android / HarmonyOS** 四端。登录与注册不区分：新号码验证成功即自动建号。

## 1. 架构总览

```
                       ┌─────────────────────────────────────────┐
  Web (Cookie)         │  apps/api  (Hono)                        │
  iOS/Android/Harmony  │  ┌─────────────────────────────────────┐│
  (Bearer)  ─────────► │  │ auth.routes.ts                      ││
                       │  │  /auth/otp/request  /auth/otp/verify ││
                       │  │  /auth/refresh /auth/logout /auth/me ││
                       │  └───────┬──────────────┬──────────────┘│
                       │          │              │               │
                       │   OtpService      SessionService        │
                       │  (@infra/auth)   (better-auth + tokens)  │
                       └────────┬──────────────────┬─────────────┘
                                │                  │
                      ┌─────────▼──────┐   ┌───────▼─────────┐
                      │ Redis 7        │   │ PostgreSQL 16   │
                      │ (短期: OTP/限流)│   │ (长期: 用户数据) │
                      └────────────────┘   └─────────────────┘
```

**职责分离（六边形 / 端口-适配器）**

- `@infra/auth/otp.ts` — 纯领域逻辑，只依赖一个最小 `OtpStore` 端口；不 import 任何 Redis 驱动。
- `@infra/redis/client.ts` — `OtpStore` 的 ioredis 适配器（基础设施实现领域端口）。
- `@infra/auth/better-auth.ts` — Better Auth 实例（Drizzle 适配器 + `bearer()` 插件）。
- `@infra/auth/require-user.ts` — 与传输无关的会话解析（Cookie 与 Bearer 通吃）。
- `apps/api/services/*` — 把领域端口接到真实 Postgres / Better Auth。

## 2. 数据存储划分

| 存储 | 数据 | 生命周期 |
|------|------|----------|
| **Postgres** | `user` `profile` `device` `refresh_token` `login_event`（+ Better Auth 的 `session` `account` `verification`） | 长期 |
| **Redis** | 验证码哈希、错误次数、发送冷却、按手机号/IP 限流、锁定标记 | 短期（TTL 自动过期） |

### Redis Key 设计（`packages/auth/src/otp.ts` → `OTP_KEYS`）

| Key | 含义 | TTL |
|-----|------|-----|
| `otp:code:{phone}` | 验证码的 **HMAC-SHA256 哈希**（绝不存明文） | 300s |
| `otp:attempt:{phone}` | 当前验证码的错误次数 | 跟随验证码（300s） |
| `otp:cooldown:{phone}` | 60s 重发冷却标记 | 60s |
| `otp:lock:{phone}` | 锁定标记 | 600s |
| `otp:daily:{phone}:{YYYY-MM-DD}` | 当日发送计数 | 86400s |
| `otp:ip:{ip}:{YYYY-MM-DDTHH}` | 当前小时该 IP 发送计数 | 3600s |

## 3. 认证规则（全部在 OTP service 内实现并测试）

| 规则 | 取值 | 实现 |
|------|------|------|
| 验证码长度 | 6 位数字（`crypto.randomInt`，保留前导零） | `generateCode` |
| 验证码 TTL | 5 分钟 | `otp:code` EX 300 |
| 重发冷却 | 同号 60s | `otp:cooldown` |
| 每日上限 | 同号 10 次/日 | `otp:daily`（读后增，避免误扣） |
| IP 限流 | 同 IP 30 次/小时 | `otp:ip` |
| 锁定 | 错误 5 次 → 锁 10 分钟 | `otp:attempt` ≥ 5 → `otp:lock` |
| 仅存哈希 | HMAC-SHA256(code, `OTP_SECRET`) | `hashCode` + `timingSafeEqual` |
| 验证即删 | 成功后立即删除 `otp:code` 与 `otp:attempt` | `verifyCode` 成功分支 |
| 自动建号 | 新号码验证成功 → 建 `user` + `profile` | `users.createWithProfile`（事务） |

请求顺序：`lock → cooldown → daily → ip → 发码`；任一闸门不通过都不会消耗后续配额。

## 4. 会话与多端

| 端 | 凭证 | 说明 |
|----|------|------|
| Web | **HttpOnly Cookie**（`infra.session`，`HttpOnly; SameSite=Lax; Max-Age=30d`，生产再加 `Secure`） | 前端不接触任何 token |
| iOS / Android / HarmonyOS | **Bearer accessToken + refreshToken** | accessToken 15 分钟，refreshToken 30 天、Postgres 仅存哈希、轮转时旧 token 立即失效 |

- `requireUser(headers)` 先走 Better Auth `auth.api.getSession`（`bearer()` 插件把 `Authorization` 归一到会话），再回退校验 OTP 流程签发的 token —— **Cookie 与 Bearer 同时支持**。
- `device.platform` 枚举：`web | ios | android | harmony`（Postgres `platform` enum）。

> **设计取舍**：Better Auth 默认会话是「单 token」模型，原生端需要的「短 access + 长 refresh + 轮转」由我们自管的 `refresh_token` 表补足；Better Auth 负责身份模型（user/session/account）与 Cookie/Bearer 解析。详见 [decision 记录可补充]。

## 5. 四端 SDK 接口草案

统一契约位于 `packages/shared/src/contracts/auth.ts`（`AuthClient` 接口、错误码、限值、端点常量、Zod 校验）。
参考实现 `createAuthClient`（`packages/shared/src/sdk/client.ts`）已可直接用于 Web 与任何 JS 运行时；
原生端按下列草案实现同一套 `AuthClient` 语义，仅替换传输层与安全存储。

**统一接口**

```ts
interface AuthClient {
  requestOtp(input): Promise<RequestOtpResponse>;
  verifyOtp(input): Promise<VerifyOtpResponse>; // 成功后原生端落库 tokens
  refresh(): Promise<AuthTokens | null>;        // Web 为 no-op（Cookie 由服务端续期）
  me(): Promise<AuthUser>;
  logout(): Promise<void>;
}
```

**Web (TypeScript)** — `credentials: "include"`，不持有 token：

```ts
const auth = createAuthClient({ baseUrl: API, platform: "web" });
await auth.requestOtp({ phone, platform: "web" });
await auth.verifyOtp({ phone, code, platform: "web" }); // 服务端写 HttpOnly Cookie
```

**iOS (Swift)** — URLSession + Keychain：

```swift
protocol AuthClient {
  func requestOtp(phone: String) async throws -> RequestOtpResponse
  func verifyOtp(phone: String, code: String, device: DeviceInfo) async throws -> VerifyOtpResponse
  func refresh() async throws -> AuthTokens?   // 读 Keychain.refreshToken → POST /auth/refresh
  func me() async throws -> AuthUser
  func logout() async throws
}
// 请求头: Authorization: "Bearer \(keychain.accessToken)"；tokens 存 Keychain（kSecAttrAccessibleAfterFirstUnlock）
```

**Android (Kotlin)** — Retrofit/OkHttp + EncryptedSharedPreferences：

```kotlin
interface AuthClient {
  suspend fun requestOtp(phone: String): RequestOtpResponse
  suspend fun verifyOtp(phone: String, code: String, device: DeviceInfo): VerifyOtpResponse
  suspend fun refresh(): AuthTokens?           // 401 时由 Authenticator 自动用 refreshToken 续期
  suspend fun me(): AuthUser
  suspend fun logout()
}
// OkHttp Interceptor 注入 "Authorization: Bearer <accessToken>"；tokens 存 EncryptedSharedPreferences / Keystore
```

**HarmonyOS (ArkTS)** — `@ohos.net.http` + `@ohos.security.huks` / Preferences：

```ts
interface AuthClient {
  requestOtp(phone: string): Promise<RequestOtpResponse>;
  verifyOtp(phone: string, code: string, device: DeviceInfo): Promise<VerifyOtpResponse>;
  refresh(): Promise<AuthTokens | null>;
  me(): Promise<AuthUser>;
  logout(): Promise<void>;
}
// http.createHttp() 发请求，header.Authorization = `Bearer ${accessToken}`；token 用 HUKS 加密后存 Preferences
```

四端共享：端点路径 `AUTH_ROUTES`、错误码 `AuthErrorCode`、设备信息 `DeviceInfo`、平台枚举 `Platform`。

## 6. TDD 执行顺序（已遵循）

1. `packages/auth/test/otp.test.ts` —— OTP service 行为（TTL/冷却/限流/锁定/单次/哈希）。
2. `apps/api/test/auth.routes.test.ts` —— 路由编排（状态码映射、建号、Cookie vs Token、轮转）。
3. `packages/auth/src/otp.ts` + `packages/redis/src/client.ts` —— 实现 Redis OTP service。
4. `packages/auth/src/better-auth.ts` + `apps/api/src/services/*` —— Better Auth 集成。
5. `apps/web/app/auth/page.tsx` + `packages/shared/src/sdk/client.ts` —— Web 登录页 + 四端 SDK 草案。

## 7. 运行

```bash
cp .env.example .env          # 配置 DATABASE_URL / REDIS_URL / OTP_SECRET
docker compose up -d          # Postgres 16 + Redis 7（含 healthcheck）
pnpm install && pnpm build
pnpm --filter @infra/db push  # 建表（含 Better Auth 表）
pnpm test                     # 单元/集成测试
node scripts/verify-redis.mjs # 针对真实 Redis 的验收脚本
pnpm --filter @infra/api dev  # 启动 API (:3001)
pnpm --filter @infra/web dev  # 启动 Web (:3000)
```

## 8. 生产化 TODO（超出本 lab 范围）

- 接真实短信网关替换 `sms()` 桩；`OTP_DEBUG_RETURN_CODE` 必须关闭。
- `COOKIE_SECURE=true` + HTTPS；按需设置 `COOKIE_DOMAIN`。
- Drizzle 用 `generate` + `migrate`（迁移文件入库）替代 `push`。
- access token 改用 Better Auth 原生会话签名 / JWKS，便于跨服务校验。
- 限流可叠加滑动窗口与全局 IP 黑名单；`login_event` 接入审计与风控。
```
