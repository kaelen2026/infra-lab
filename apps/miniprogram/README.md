# @infra/miniprogram

infra-lab 的**微信小程序端**。与 ios/android/harmony 一样镜像共享 `AuthClient` 语义
(login == register),但因为它是 TS 端,**直接复用 `@infra/sdk` 的 `createAuthClient`**,
只替换传输层(`wx.request`)与存储(wx storage)——不重写业务逻辑。

- **平台身份**:`platform: "weapp"`,无 cookie,走与 `cli` 相同的 Bearer + refresh 通道。
- **传输**:`src/sdk/wx-fetch.ts` —— 一个 `fetch` 形状的 `wx.request` 适配器,注入进 SDK。
- **存储**:`src/sdk/wx-token-store.ts` —— wx storage 版 `TokenStore`。

## 构建模型(为什么有 `src/` 和 `miniprogram/` 两层)

微信的 `构建 npm` 对 workspace 软链 + ESM 支持脆弱,所以这里**不用它**。改为用 **tsup 把每个
入口 bundle 成自包含 CJS**,内联 `@infra/sdk`(+`@infra/shared`),输出到 `miniprogram/`,与
手写视图并排:

```
src/                      # 所有 TS(tsc 按源码别名 typecheck,可进 CI)
├─ app.ts  pages/*.ts     # 页面逻辑
└─ sdk/                   # 平台胶水:wx-fetch / wx-token-store / device / with-refresh / index
miniprogram/              # 小程序根(miniprogramRoot)
├─ app.json  app.wxss  sitemap.json
├─ tokens.generated.wxss  theme.json   # ← @infra/design 发射(pnpm gen:design,禁手改)
├─ app.js  pages/*/index.js   # ← tsup 产物(.gitignore,不提交)
└─ pages/*/index.{wxml,wxss,json}   # 手写视图
```

- `pnpm --filter @infra/miniprogram build` → tsup 产出 `miniprogram/**/*.js`。
- `pnpm --filter @infra/miniprogram dev` → tsup watch。
- `pnpm --filter @infra/miniprogram typecheck` → `tsc --noEmit`(**进 CI**)。
- 单测 `test/wx-fetch.test.ts`(mock `wx`,hermetic)→ 进根 vitest / CI。
- **小程序构建/预览本身不进 CI**(微信开发者工具专有、仅 macOS/Windows)——同 ios/harmony,本地门禁。

## 本地跑通(不依赖合规)

1. 起后端:`pnpm dev:api`(:3001),`.env` 里 `OTP_DEBUG_RETURN_CODE=true` 可直接回码免短信。
2. `pnpm --filter @infra/miniprogram dev`(tsup watch 产 bundle)。
3. 微信开发者工具「导入项目」选 `apps/miniprogram/`,appid 用**测试号**;
   详情 → 本地设置 → 勾选 **不校验合法域名**(`project.config.json` 已置 `urlCheck:false`)。
4. 走通:填手机号 → 收码 → 登录 → 待办增删改 → 我的(改昵称 / 退出)。

`src/sdk/config.ts` 的 `API_BASE_URL` 默认 `http://localhost:3001`,按环境改。

## 范围(MVP)

**已含**:手机号+OTP 登录、会话持久化 + 401 自动 refresh、todo 增删改查、profile 看/改昵称。
**未含(二期)**:微信 `getPhoneNumber` 一键授权(需新后端 grant + 企业主体)、扫码跨端登录审批、
timeline 分享(小程序码 + scene)、头像上传、`@infra/design` 的 WXSS token 生成。

## 安全

- token 仅存 wx storage:小程序沙箱隔离但**非硬件加密**,达不到 Keychain/HUKS 的保证;
  靠短期 access + 轮换 refresh 缩小暴露窗口。登出必须 `wxTokenStore.clear()`。
- **绝不 log 手机号 / 验证码 / token**。

## 合规(阻塞的是**发布**,不是本地开发,并行推进)

- ☐ API 域名 **ICP 备案** + HTTPS(小程序正式版 request 合法域名的硬前提)
- ☐ 注册小程序、拿正式 **appid**(`getPhoneNumber`/企业能力需企业主体)
- ☐ mp 后台 request 合法域名 = 生产 API 域名
- ☐ 首次发布过微信审核
