# Google 登录接入设计

> 状态:**设计草案(未实现)**。本文档规划把 Google（OAuth 2.0 / OIDC）作为
> 手机号+OTP 之外的第二条登录入口接入本仓库。范围含 `web / h5 / ios / android /
> harmony / cli`;**`miniprogram`(微信小程序)先不支持**(见 §1)。落地按 §8 分阶段
> 提 PR;本文档先合入,作为后续各 PR 的事实源。

## 1. 目标与范围

- 用户可用 **Google 账号** 登录/注册(与现有手机号 OTP 一样,login == register)。
- 支持端:`web`、`h5`(浏览器重定向流)、`ios`、`android`、`harmony`、`cli`(原生 ID
  Token 流)。
- **不支持 `miniprogram`(`platform=weapp`)**:微信小程序运行在受限的 `wx.*` 容器里,
  没有系统浏览器 / 自定义 Tab / `ASWebAuthenticationSession`,无法承载 Google 的
  OAuth 重定向;Google 也不在国内小程序场景。小程序继续只走手机号 OTP。契约层面
  Google 相关能力对 `weapp` 一律不暴露(见 §4)。

**非目标**(本次不做,列入 §9 未决):账号绑定/合并(同一自然人的手机号账号与 Google
账号打通)、其它社交源(Apple / 微信 / GitHub)、把 email 变为可登录的第一凭证。

## 2. 核心设计决策(需产品确认的关键项)

### 2.1 身份模型:Google 账号 = 独立的新账号(默认方案)

现状:`user` 以 **手机号** 为主身份(`user.phone` 唯一),Google 只提供 **email**,两者
是**不相交的身份空间**——OTP 用户没有 email,Google 用户没有手机号,**无法自动匹配**。

**默认方案(推荐,成本最低、语义最清晰):** 一次 Google 登录 = 一个以 Google 账号
(`account.providerId='google'` + `account.accountId=<google sub>`)标识的用户;若该
Google 账号从未登录过,则**新建 `user`(email 有值、`phone` 为 `null`)+ `profile`**,
与手机号新用户的 find-or-create 完全对称。已存在则直接复用。

数据基础已就绪:`packages/db/schema/auth.ts` 里 `user.phone`、`user.email` 都是**可空**
且各有唯一索引,`account` 表就是 Better Auth 标准 OAuth 账户表。**无需迁移即可容纳
"只有 Google、没有手机号" 的用户。**

> ⚠️ **需产品确认**:是否要"同一个人手机号登录后再绑 Google / 反之"的**账号绑定**?
> 若要,则需要新增绑定端点、在已登录态下调用 Better Auth 的 link-account、并处理
> "Google email 恰好等于某手机号用户后来填的 email" 的冲突。**本设计默认不做绑定**,
> Google 账号与手机号账号各自独立;绑定作为后续增量(§9)。确认后再动工,避免返工。

### 2.2 会话桥接:Google 登录后签发**本仓库自己的**会话,而非 Better Auth 会话

现状(`.claude/docs/architecture.md` + `apps/api/src/services/session-service.ts`):

- 会话由**自研 `SessionService`** 签发——web 是自签 HS256 JWT 写进 `infra.session`
  HttpOnly cookie;native 是自研 Bearer accessToken + `refresh_token` 表(哈希存储、
  轮换)。
- Better Auth **仅作身份存储 + 解析器**:`requireUser` 先试 `auth.api.getSession`,
  再回落到验证我们自己的 JWT。

**决策:Google 登录成功后,复用 `SessionService.issueWebSessionForUser(userId)` /
`issueTokens(user, ctx)` 签发会话**,让 Google 会话对下游(`requireUser`、`/auth/me`、
todo/timeline、logout 全量吊销)与 OTP 会话**完全一致**。**不**让客户端依赖 Better
Auth 自带的 session cookie——否则 web 会出现两套 cookie 语义、logout 吊销逻辑分叉。
Better Auth 在 OAuth 流程里创建的 `session` 行是其内部实现细节,我们不对外依赖。

## 3. 数据模型

**无需 schema 迁移**(§2.1):`user.phone` / `user.email` 已可空且唯一,`account` 表已是
Better Auth OAuth 账户表。落地时仅需:

- 用 `pnpm --filter @infra/db generate` 确认 diff 为空(社交登录不新增列);
- `profile` 仍每用户一行:Google 新用户在同一事务里建 `profile`,`displayName` 取
  Google `name`、`avatarUrl` 可取 Google `picture`(或留空,走既有头像上传)。

## 4. 契约变更(`packages/shared` — 跨端事实源)

新增 `packages/shared/src/contracts/social.ts`(一域一文件,契约规则见
`.claude/rules/typescript.md`):

- `SOCIAL_PROVIDERS = ["google"] as const` → `SocialProvider`(为后续 Apple 等留扩展位)。
- `SOCIAL_ROUTES`:
  - `startWebOAuth`(web/h5 用):`GET /auth/social/:provider/start?platform=web&redirect=<path>`
    —— 302 到 Google;回调后由后端桥接签发 `infra.session` cookie 并 302 回 `redirect`。
  - `nativeIdToken`(原生用):`POST /auth/social/:provider/token`,body
    `{ idToken, platform, device? }`,返回**与 `verifyOtp` 同构**的
    `{ ok, user, tokens }`。
- **`AuthUser.phone` 由 `string` 改为 `string | null`**(Google 用户无手机号)。这是
  **破坏性跨端契约变更**,波及所有解码 `AuthUser` 的客户端:
  - TS:`@infra/sdk`、`apps/web`、`apps/h5`、`apps/cli` 处理 `phone` 展示的地方需容忍
    `null`(显示 email / 名称兜底)。
  - 原生:iOS `AuthContracts.swift`、Android `@Serializable` 契约、Harmony
    `common/contracts.ets` 的 `phone` 字段改可空,**必须与本次同 PR 或紧随其后的镜像
    PR 协调**(原生门禁在本地,不进 CI)。
- 新增错误码:`SOCIAL_PROVIDER_DISABLED`(未配置 clientId 时)、`SOCIAL_TOKEN_INVALID`
  (idToken 校验失败)、`SOCIAL_ACCOUNT_ERROR`;并入 `AUTH_ERROR_CODES` 与
  `ERROR_STATUS`(→ 400/401)。
- `AuthClient` 接口按端能力**可选**扩展 `signInWithGoogleIdToken(...)`(原生实现),web
  用重定向不进该接口。`weapp` 不实现任何 Google 方法(§1)。

## 5. 后端接入(`apps/api` + `packages/auth`)

### 5.1 Better Auth 配置(`packages/auth/src/better-auth.ts`)

`createAuth` 增加可选 `socialProviders`;仅当 env 提供了 clientId/secret 时才注入
`google`(缺失即视为该 provider 关闭):

```ts
// 伪代码 — better-auth 1.6.23
betterAuth({
  ...,
  socialProviders: options.google
    ? { google: { clientId: options.google.clientId, clientSecret: options.google.clientSecret } }
    : undefined,
  plugins: [bearer()],
});
```

Better Auth 的 `/api/auth/*` handler 已挂在 `apps/api/src/app.ts:166`,OAuth 回调
(`/api/auth/callback/google`)基础设施随之可用。

### 5.2 web / h5 重定向流

1. 浏览器点 "使用 Google 登录" → 打到我们的 `GET /auth/social/google/start`(带
   `redirect` 回跳路径)。
2. 该路由内部触发 Better Auth 的 social sign-in(server 侧 `auth.api.signInSocial`
   或直接 302 到其 `/api/auth/sign-in/social`),Google 授权后回调
   `/api/auth/callback/google`,Better Auth 完成 find-or-create(写 `user`/`account`)。
3. **桥接**:在回调完成处(Better Auth `hooks.after` 或我们包一层回调处理),用刚解析出
   的 `userId` 调 `sessions.issueWebSessionForUser(userId)` 写 `infra.session` cookie,
   再 302 回 `redirect`。**不把 Better Auth 的 session cookie 作为对外契约。**
4. 审计:复用 `users.recordLoginEvent`(`platform=web`,`phone` 可空 → 记 `null`,新增
   一个非手机来源标记或复用 `reason`)。

> 该桥接是本设计**技术风险最高**的一环:需确认 better-auth 1.6.23 的 after-hook 能拿到
> 新会话的 userId、以及回调响应能被我们改写为"清掉 BA cookie + 下发 infra cookie + 302"。
> 落地首个 PR 应带**集成测试**(hermetic:mock Google token 端点)锁定这条链路。

### 5.3 native ID Token 流(ios/android/harmony/cli)

原生端不走浏览器重定向拿 cookie,而是**设备本地 Google SDK 拿到 ID Token**后交给后端:

1. 客户端用平台 Google 登录(iOS `GoogleSignIn` / Android `Credential Manager` /
   Harmony 侧走系统能力或 web 授权取 idToken;cli 走 loopback 或复用 web 流)取到
   `idToken`。
2. `POST /auth/social/google/token { idToken, platform, device? }`。
3. 后端用 Better Auth 的 idToken 登录能力(`signInSocial({ provider:'google',
   idToken })`)校验 + find-or-create,拿到 `userId`。
4. 复用 `sessions.issueTokens(user, ctx)` 返回 Bearer + refresh,响应与 `verifyOtp`
   **同构** → 原生端复用既有 token 存储与刷新逻辑,几乎零改动。

## 6. 各端 rollout

| 端 | 流 | 主要改动 |
|---|---|---|
| `web` | 重定向 | 登录页加 Google 按钮(`apps/web/features/auth/`),打到 `/auth/social/google/start` |
| `h5` | 重定向 | 同 web,复用 cookie 通道 |
| `ios` | idToken | `GoogleSignIn` SDK + `HTTPAuthClient.signInWithGoogleIdToken`;契约 `phone` 改可空 |
| `android` | idToken | Credential Manager + Retrofit;契约 `phone` 改可空 |
| `harmony` | idToken | 取 idToken + `AuthClient.ets`;`contracts.ets` `phone` 改可空 |
| `cli` | idToken/loopback | `auth login --google`;可复用 web 授权 |
| `miniprogram` | — | **不支持**,契约不暴露(§1) |

原生端质量门禁是**本地**(iOS SwiftLint / Android detekt / Harmony CodeLinter),不进
CI——各端改动需本地过门禁,并保证 `phone` 可空后无强解包(`!` / `!!` / force-unwrap)。

## 7. 环境变量与密钥

`packages/env/src/core.ts` 新增(均**可选**,缺失即关闭 Google 登录):

- `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`(web/后端 OAuth)。
- 原生各端有各自的 Google client id(iOS/Android 在其平台配置里),后端校验 idToken 时
  需允许这些 audience。
- `.env.example` 补注释;**secret 绝不入库、不进日志**(遵循可观测性规则:不记
  phone/OTP/token)。
- 生产启动守卫:若设置了 `GOOGLE_CLIENT_ID` 却无 `GOOGLE_CLIENT_SECRET`(或反之)应
  拒绝启动,与现有 env 守卫风格一致。

## 8. 分阶段实施(建议 PR 拆分)

1. **本 PR:设计文档**(此文件)+ 在 `.claude/docs/architecture.md` 增一节指针。
2. **契约 + 后端**:`social.ts` 契约、`AuthUser.phone` 可空、`createAuth` 注入
   `socialProviders`、`/auth/social/*` 路由 + 会话桥接、env、**hermetic 集成测试**。
   全部走 CI 门禁(lint/typecheck/build/test)。TS 客户端(sdk/web/h5/cli)同 PR 跟上
   `phone` 可空。
3. **web/h5 UI**:Google 登录按钮 + 回跳落地。
4. **原生镜像**(可并行、各自 PR):iOS / Android / Harmony 契约镜像 + idToken 流 + 本地
   门禁。
5. **cli**:`auth login --google`。

## 9. 未决问题(需产品/负责人拍板)

1. **账号绑定**:手机号账号与 Google 账号是否要能互相绑定/合并?(默认:不绑,各自独立。)
2. **email 冲突策略**:两个不同 Google 账号返回相同 email 几乎不会发生(Google sub 唯一),
   但若未来允许 email 登录需定策略。
3. **Google `picture` 头像**:是否自动拉取为 `avatarUrl`,还是仅新用户默认、之后由用户上传覆盖。
4. **cli 的 Google 流**:loopback 回调 vs 复用现有 web device flow(后者可免本地端口,
   与现有 `auth login --web` 一致,倾向后者)。
5. **合规**:Google 登录页/隐私政策需在 `@infra/design` 的法律文案里补充第三方登录说明。

---

**参考坐标**:身份/会话跨文件全景 `.claude/docs/architecture.md`;会话签发
`apps/api/src/services/session-service.ts`;OTP verify 桥接参照
`apps/api/src/routes/auth.routes.ts:243+`;Better Auth 配置
`packages/auth/src/better-auth.ts`;契约 `packages/shared/src/contracts/auth.ts`;
schema `packages/db/schema/auth.ts`。
