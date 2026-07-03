# `apps/cli` 计划:终端客户端与浏览器辅助登录

## 现状(本 PR 已落地)

`@infra/cli`(bin `infra-lab`)复用 `@infra/sdk`,以 `platform: "cli"` 走 native 的
Bearer + refresh 传输,把会话持久化到 `~/.config/infra-lab/credentials.json`(`0600`)。
`cli` 已作为一等平台加入 `PLATFORMS`(`packages/shared`)与 `platformEnum`
(`packages/db`)——加值是向后兼容的:原生端只发送自身平台值、从不解码该枚举,不受
影响;dev 环境用 `pnpm --filter @infra/db push` 让 Postgres 枚举加上 `cli`。

命令:`auth login | whoami | logout`、`todo list | add | done | rm`。`login` 走终端
OTP,不依赖任何新增 API。

## 待定:浏览器辅助登录("打开浏览器复用状态")

需求原文希望 `auth login` 能"打开浏览器复用状态"。核心矛盾:

- web 会话是 **HttpOnly cookie**,浏览器 JS 读不到,独立 CLI 进程更读不到浏览器的
  cookie jar——无法直接"复用"浏览器 cookie。
- CLI 需要的是可持久化、可续期的 **Bearer + refresh token**(native 那套)。

因此要把浏览器登录态交接给 CLI,需引入业界标准的 **loopback 授权码** 流程,而这会新增
一处"cookie 会话 → 可签发长期 Bearer"的认证面,**需要安全评审**,故拆分为独立后续。

### 建议流程(loopback + 一次性授权码)

1. CLI 在 `127.0.0.1:<随机端口>` 起一个一次性本地 HTTP server,生成 `state` 随机串。
2. CLI 打开浏览器到 `${WEB}/auth/cli?port=<port>&state=<state>`。
3. 该 web 页面确保用户已登录(未登录则走现有 web OTP 流程,拿到 cookie 会话)。
4. 页面携带 cookie 调新端点 `POST /auth/cli/authorize`(cookie 鉴权 + CSRF 校验),
   服务端复用 `session-service.issueTokens` 以 `platform: "cli"` 签发一对
   Bearer/refresh,并登记一个 device 行;返回一个**一次性、短 TTL 的授权码**(存 Redis,
   而非把 token 直接回传给页面)。
5. 页面 302 到 `http://127.0.0.1:<port>/callback?code=<授权码>&state=<state>`。
6. CLI 校验 `state`,以授权码换取 token(`POST /auth/cli/token`,一次性消费),写入
   凭据文件,提示用户关闭标签页。

### 需要改动的面(跨包,需协调)

- `packages/shared/contracts/auth.ts`:新增 `/auth/cli/authorize`、`/auth/cli/token`
  路由与请求/响应 schema(契约是唯一真源,属跨端变更)。
- `apps/api`:两个新路由 + Redis 里的一次性授权码存储(TTL、单次消费),复用
  `session-service` 的令牌签发;`authorize` 必须是 cookie 鉴权且做 CSRF 防护。
- `apps/web`:新增 `/auth/cli` 页面(确保登录 → 授权 → 回跳 loopback)。
- `apps/cli`:`auth login --web` 子命令(loopback server + 打开浏览器 + 轮询/回调)。

### 安全要点(评审重点)

- 一次性授权码:短 TTL、单次消费、与 `state` 绑定;token 永不经浏览器地址栏明文回传。
- `authorize` 端点的 CSRF 防护(cookie 会话可被跨站触发签发长期 token 的风险)。
- loopback 仅绑 `127.0.0.1`,校验 `state` 防止本机其他进程抢答。
- 审计:该登录同样写 `login_event`,device 行 `platform = "cli"`。

在获得产品/安全确认后,再按上述流程实现 `--web`;当前终端 OTP 登录已可独立使用。
