# 验收记录 — 手机号 + 验证码认证

- 日期：2026-06-30
- 环境：Node v24.16.0 · pnpm 10.33.1 · Docker 29.3.1 · postgres:16-alpine · redis:7-alpine
- 结论：**全部验收标准通过 ✅**

每条标准下给出复现命令与实际证据（节选自实跑输出）。

---

## 1. `docker compose up -d` 后 Postgres 和 Redis healthcheck 通过 ✅

```bash
docker compose up -d
docker inspect --format '{{.State.Health.Status}}' infra-lab-postgres infra-lab-redis
```
输出：
```
postgres=healthy redis=healthy
```
- Postgres healthcheck：`pg_isready -U app -d app`
- Redis healthcheck：`redis-cli ping`

## 2. `pnpm test` 通过 ✅

```
 Test Files  3 passed (3)
      Tests  24 passed (24)
```
覆盖：`otp.test.ts`（请求/验证/限流/锁定/单次/哈希）、`require-user.test.ts`（Cookie+Bearer 解析）、`auth.routes.test.ts`（路由编排、建号、Cookie vs Token、刷新轮转）。

## 3. `pnpm build` 通过 ✅

```
BUILD EXIT=0
```
- `@infra/shared` `@infra/auth` `@infra/redis` `@infra/db` `@infra/api` → tsup（ESM + d.ts）
- `@infra/web` → `next build`（Turbopack），路由 `/ ○`、`/auth ○` 静态生成
- `pnpm -r typecheck` 全部 `Done`

## 4. 发送验证码后 Redis 存在 otp key，TTL ≤ 300s ✅

```bash
node scripts/verify-redis.mjs   # 连真实 Redis
```
```
✅ Redis has otp key after send
✅ otp key stores a hash, not the plaintext      # 仅 64 位 hex，非明文
✅ otp TTL is > 0 and <= 300s — ttl=300
```

## 5. 60 秒内重复发送被拒绝 ✅

```
✅ resend within 60s rejected with RESEND_COOLDOWN
```
HTTP 层映射为 `429 { code: "RESEND_COOLDOWN", retryAfter }`（见 `auth.routes.test.ts`）。

## 6. 5 次错误验证码后手机号被锁定 10 分钟 ✅

```
✅ locked after 5 wrong attempts
✅ lock TTL is > 0 and <= 600s — ttl=600
```
HTTP 层映射为 `423 LOCKED`。

## 7. 正确验证码只能使用一次 ✅

```
✅ correct code verifies
✅ same code cannot be reused           # 第二次 → CODE_EXPIRED
✅ otp key deleted after success
✅ attempt key deleted after success
```

## 8. 新手机号验证成功后 Postgres 存在 user + profile ✅

实跑 Web 流程（手机号 `+861503079384`）+ App 流程（`+861513079384`）后查询：
```
user                  | 2
profile               | 2     # 验证成功自动创建 profile
device(ios)           | 1
login_event           | 2
refresh_token(active) | 1     # 轮转后旧 token 已 revoke
```
表清单：`account device login_event profile refresh_token session user verification`。

## 9. Web 登录成功后写入 HttpOnly Cookie ✅

```
verify(web) body: {"ok":true,"user":{...,"isNew":true}}    # 响应体无 tokens
Set-Cookie: infra.session=<jwt>; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Domain=localhost
```

## 10. App 登录成功后返回 accessToken + refreshToken ✅

```
verify(ios) -> {"ok":true,"user":{...},"tokens":{
  "accessToken":"<jwt>","accessTokenExpiresIn":900,
  "refreshToken":"<opaque>","refreshTokenExpiresIn":2592000,"tokenType":"Bearer"}}   # 无 Set-Cookie
```
刷新轮转：
```
POST /auth/refresh (旧 refreshToken) -> 200 新 tokens（refreshToken 已变）
POST /auth/refresh (再用旧 refreshToken) -> 401 {"code":"INVALID_REFRESH_TOKEN"}
```

---

## 复现步骤汇总

```bash
cp .env.example .env
docker compose up -d
pnpm install && pnpm build
pnpm --filter @infra/db push
pnpm test
set -a; . ./.env; set +a
node scripts/verify-redis.mjs
PORT=3001 node apps/api/dist/server.js &     # 调试用，OTP_DEBUG_RETURN_CODE=true 时响应含 debugCode
# 然后按 §9/§10 的 curl 走 web / ios 流程
```

## 备注

- `OTP_DEBUG_RETURN_CODE=true` 仅用于本地验收（让 `/auth/otp/request` 回显验证码）；生产必须为 `false`，验证码只经短信网关下发。
- 验证码在 Redis 中只存 HMAC-SHA256 哈希；比对用 `crypto.timingSafeEqual`。
- access token 当前为自管 HS256 JWT；Better Auth 负责身份模型与 Cookie/Bearer 会话解析（`auth.api.getSession` + `bearer()` 插件）。
