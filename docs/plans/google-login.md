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

**账号绑定纳入本设计**(见 §2.3,已确认要做):同一账号可同时挂手机号 + Google 两种登录
凭证,两种方式都能登录到同一个 `user`。**非目标**(本次不做):账号**合并**——把两个
**已独立存在**的账号(各有 todo/timeline/device 等数据)打通迁移到一起;这是独立的高风险
课题(见 §2.3 冲突规则与 §9)、其它社交源(Apple / 微信 / GitHub)、把 email 变为可登录
的第一凭证。

## 2. 核心设计决策

### 2.1 身份模型:Google 账号 = 独立的新账号(首次登录时)

现状:`user` 以 **手机号** 为主身份(`user.phone` 唯一),Google 只提供 **email**,两者
是**不相交的身份空间**——OTP 用户没有 email,Google 用户没有手机号,**无法自动匹配**。

**首次用某 Google 账号登录**(此前从未登录、也未被任何账号绑定):新建一个以 Google 账号
(`account.providerId='google'` + `account.accountId=<google sub>`)标识的 `user`
(email 有值、`phone` 为 `null`)+ `profile`,与手机号新用户的 find-or-create 完全对称。
该 Google 账号已属于某个 `user`(无论是独立注册还是被绑定的)则直接复用、登录到那个 user。

数据基础已就绪:`packages/db/schema/auth.ts` 里 `user.phone`、`user.email` 都是**可空**
且各有唯一索引,`account` 表就是 Better Auth 标准 OAuth 账户表。**无需迁移即可容纳
"只有 Google、没有手机号" 的用户,也无需迁移即可让一个 user 同时有 phone + google account。**

### 2.3 账号绑定(已确认要做)

**语义**:绑定 = **已登录**用户给当前账号**追加**第二种登录凭证,之后两种方式都登录到
**同一个** `user`。这**不是**账号合并(§1 非目标)——绑定只处理"目标凭证尚未被占用"的
情形,不迁移两个既有账号的数据。

**两个方向(对称)**:

1. **手机号账号 → 绑 Google**:已登录态(Cookie/Bearer)发起 **link 模式** 的 Google
   OAuth / idToken 流(与 §5.2 / §5.3 同一套传输,但**不新建 user**,而是把 google
   `account` 行挂到 `当前 requireUser 解析出的 user.id`,并在 `user.email` 为空时回填)。
2. **Google 账号 → 绑手机号**:已登录态复用现有 OTP —— 先 `POST /auth/otp/request`,再
   `POST /auth/link/phone { phone, code }`;OTP 校验通过后把 `phone` 写到当前 `user`
   (**不走 `/auth/otp/verify`**,那条会 find-or-create 建新账号)。

**冲突规则(默认拒绝,绝不自动合并)**:

- 目标 Google 账号已属于**另一个** `user` → `SOCIAL_ALREADY_LINKED`(409),提示已被占用,
  引导用户先在那个账号解绑 / 或走(尚未实现的)账号合并。
- 目标手机号已属于**另一个** `user` → `PHONE_ALREADY_LINKED`(409)。
- 当前账号已绑同类凭证(已有 phone 又绑 phone / 已有 google 又绑另一个 google)→ 先要求
  解绑或直接拒绝,避免"一个 user 挂多个手机号"的歧义(本期:一个 user 至多一个 phone、
  至多一个 google account)。

**解绑**(`POST /auth/unlink { target: "google" | "phone" }`):

- **守恒规则**:一个 `user` 必须**至少保留一种可登录凭证**。解绑到只剩零个凭证 →
  `LAST_CREDENTIAL`(409)拒绝。这是防止账号变成无法登录的孤儿的硬约束。

**Better Auth link**:1.6.23 的 account linking 默认仅在 email 一致时自动 link;我们要的是
**已登录态显式 link**,需用 server 端 API(`auth.api.linkSocialAccount` / `unlinkAccount`
一类)并核对 `accountLinking.trustedProviders` 配置。**待落地时验证确切 API 名与行为**
(§9 技术校验项)。手机号侧不经 Better Auth,直接写 `user.phone`。

**审计与安全**:绑定/解绑是**敏感操作**,须记 `login_event`(复用现有表,`reason` 记
`link_google` / `link_phone` / `unlink_*`)。风险点:会话被盗后攻击者给账号绑上自己的凭证
以长期驻留 —— 缓解靠解绑能力 + (后续可选)绑定成功后向既有凭证发通知。绑手机号必须完整
走 OTP,不能凭空写入。

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
- **账号绑定端点(§2.3,均需已登录态)**:
  - `GET /auth/identities` → `{ ok, phone: boolean, providers: SocialProvider[] }`,供
    "账号安全"页展示当前已绑登录方式。
  - `POST /auth/link/social/:provider/start`(web/h5 重定向,link 模式)/
    `POST /auth/link/social/:provider/token`(原生 idToken,link 模式)。
  - `POST /auth/link/phone { phone, code }`(已登录 + OTP 已通过,把手机号挂到当前 user)。
  - `POST /auth/unlink { target }`(`target: "google" | "phone"`)。
- **`AuthUser.phone` 由 `string` 改为 `string | null`**(Google 用户无手机号)。这是
  **破坏性跨端契约变更**,波及所有解码 `AuthUser` 的客户端:
  - TS:`@infra/sdk`、`apps/web`、`apps/h5`、`apps/cli` 处理 `phone` 展示的地方需容忍
    `null`(显示 email / 名称兜底)。
  - 原生:iOS `AuthContracts.swift`、Android `@Serializable` 契约、Harmony
    `common/contracts.ets` 的 `phone` 字段改可空,**必须与本次同 PR 或紧随其后的镜像
    PR 协调**(原生门禁在本地,不进 CI)。
- 新增错误码:`SOCIAL_PROVIDER_DISABLED`(未配置 clientId 时)、`SOCIAL_TOKEN_INVALID`
  (idToken 校验失败)、`SOCIAL_ACCOUNT_ERROR`;绑定相关 `SOCIAL_ALREADY_LINKED`、
  `PHONE_ALREADY_LINKED`、`LAST_CREDENTIAL`(§2.3,→ 409);并入 `AUTH_ERROR_CODES` 与
  `ERROR_STATUS`。
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

> **已落地(stage 2b)**。经核实 better-auth 1.6.23:`hooks.after`(单个 `AuthMiddleware`,
> `createAuthMiddleware` 包裹)在 OAuth 回调完成后能读 `ctx.context.newSession.user.id`,
> 且 session `Set-Cookie` 与 302 `Location` 都在 `ctx.context.responseHeaders` 上,可原地
> 改写(删 `set-cookie`、按 `ctx.context.authCookies` 名过滤后重新 append + 追加我们的
> cookie,`Location` 不动)。gate 必须含 `newSession` 且 path 为 `/callback/:id` —— 因
> `auth.api.signInSocial`(原生 idToken 流,path `/sign-in/social`)**也**会触发 `after`。
> **origin 一致性**:BA 用 `baseURL` 拼 redirect_uri,`callbackURL` 受 `trustedOrigins`
> 校验(否则 403 `INVALID_CALLBACK_URL`);部署时须让 API 挂载 origin、`BETTER_AUTH_URL`、
> Google 控制台注册的 redirect URI 三者自洽(dev 下 web 需代理 `/api/auth/*` 到 API,或
> 直接把浏览器导到 API origin 的 `/auth/social/google/start`)。

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
2. **契约 + 后端**(落地时按风险一分为二):
   - **2a(已实现)**:`social.ts` 契约、`AuthUser.phone` 可空、`createAuth` 注入
     `socialProviders`、**原生 idToken 流** `POST /auth/social/:provider/token` + 会话桥接
     (复用 `SessionService`)、env(`GOOGLE_CLIENT_ID/SECRET` both-or-neither 守卫)、
     `login_event.phone` 可空迁移、**hermetic 测试**(路由端口 fake + 适配器 APIError 映射)。
     TS 客户端(web/h5/cli/miniprogram)同 PR 跟上 `phone` 可空。全部走 CI 门禁。
   - **2b(已实现)**:**web/h5 重定向流** `GET /auth/social/:provider/start`(校验 `redirect`
     同源路径 → `auth.api.signInSocial({ callbackURL, disableRedirect })` 取授权 URL → 302)+
     **BA 回调桥接**(`createAuth` 的 `hooks.after`,gate 于 `path==="/callback/:id" &&
     params.id && newSession`:读 `newSession.user` → 剥离 BA 自身 session cookie、下发
     `infra.session` cookie,保留 302 `Location`)。桥接与原生流**对称**:同样 `ensureProfile`
     (用 Google `name`/`picture` 建 profile)+ `recordLoginEvent`(`platform=web`、`phone=null`,
     ip 在回调 hook 处不可得记 `null`;资料/审计为 best-effort,失败不阻塞登录)。桥接抽成纯函数
     `bridgeOAuthCallbackSession` 单测锁定(不需真跑 OAuth);`/start` 路由 + 适配器走端口 fake 单测。
     > 端到端(真实 Google 码交换)不在 hermetic 范围内 —— BA 的 OAuth 机制属上游、
     > 已被其自身测试覆盖;我们新增的面(URL 生成、cookie 交换、redirect 校验、disabled)
     > 均已直测。真实联调随 stage 3 UI + 真凭证进行,并需保证 `BETTER_AUTH_URL`/回调 origin
     > /Google 控制台 redirect URI 一致(见 §5.2 备注)。
3. **web/h5 UI**:Google 登录按钮 + 回跳落地(依赖 2b)。
4. **账号绑定(§2.3)**:`/auth/identities`、`/auth/link/*`、`/auth/unlink` 端点 + 冲突/
   守恒规则 + 审计 + hermetic 测试(走 CI);web/h5 "账号安全"页展示与绑定/解绑入口。
5. **原生镜像**(可并行、各自 PR):iOS / Android / Harmony 契约镜像 + idToken 流 +
   绑定页 + 本地门禁。
6. **cli**:`auth login --google`(绑定操作在移动/web 端做即可,cli 不强求)。

## 9. 未决问题

**已确认**:账号绑定要做(§2.3);账号**合并**(迁移两个既有账号数据)暂不做。

仍需拍板 / 落地时校验:

1. **账号合并**:当用户想绑的凭证已属于**另一个既有账号**时,当前是**拒绝**(§2.3 冲突
   规则)。未来是否要提供真正的"合并"(迁移 todo/timeline/device/refresh_token 等)?
   风险高、需单独设计,本期不做。
2. **技术校验(阻塞第 4 阶段)**:better-auth 1.6.23 的显式 link/unlink server API 确切名
   与行为(`accountLinking.trustedProviders` 是否必需、link 是否强制 email 一致)——落地
   前须用最小 spike 验证,不能凭记忆。
3. **Google `picture` 头像**:自动拉取为 `avatarUrl`,还是仅新用户默认、之后由用户上传覆盖。
4. **cli 的 Google 流**:loopback 回调 vs 复用现有 web device flow(后者免本地端口,与
   `auth login --web` 一致,倾向后者)。
5. **合规**:Google 登录 + 第三方账号绑定需在 `@infra/design` 法律文案补充说明。
6. **绑定通知**(可选安全增强):绑定成功后是否向账号既有凭证发通知,以防会话被盗后被
   静默绑定。

---

**参考坐标**:身份/会话跨文件全景 `.claude/docs/architecture.md`;会话签发
`apps/api/src/services/session-service.ts`;OTP verify 桥接参照
`apps/api/src/routes/auth.routes.ts:243+`;Better Auth 配置
`packages/auth/src/better-auth.ts`;契约 `packages/shared/src/contracts/auth.ts`;
schema `packages/db/schema/auth.ts`。
