# `apps/cli` 计划:终端客户端与浏览器辅助登录

## 现状(本 PR 已落地)

`@infra/cli`(bin `infra-lab`)复用 `@infra/sdk`,以 `platform: "cli"` 走 native 的
Bearer + refresh 传输,把会话持久化到 `~/.config/infra-lab/credentials.json`(`0600`)。
`cli` 已作为一等平台加入 `PLATFORMS`(`packages/shared`)与 `platformEnum`
(`packages/db`)——加值是向后兼容的:原生端只发送自身平台值、从不解码该枚举,不受
影响;dev 环境用 `pnpm --filter @infra/db push` 让 Postgres 枚举加上 `cli`。

命令:`auth login | whoami | logout`、`todo list | add | done | rm`。`login` 走终端
OTP,不依赖任何新增 API。

## 待定:浏览器辅助登录("打开浏览器复用状态",gh cli 同款 device flow)

需求原文希望 `auth login` 能"打开浏览器复用状态"。这里参考 **GitHub CLI(`gh auth
login`)** 的真实做法——**不是**去读浏览器 cookie,而是 **OAuth Device Authorization
Grant(RFC 8628,设备流)**:CLI 拿到一个一次性码,打开浏览器让用户在**已登录的 web
会话**里点一下批准,CLI 则**轮询自己的 token 端点**拿到**自己的一对 token**。"复用状态"
指的正是第 3 步——复用浏览器现有的登录态来授权,用户无需重新登录,CLI 也从不接触 cookie。

> 参考:gh 默认走 device flow,**没有 localhost 回调**,而是轮询 API 取 token
> (见下方 Sources)。这比 loopback 更优:免本地端口、可在 SSH / 无头机上用。

### 建议流程(device flow,映射到本仓库的手机号 + OTP)

1. CLI 调 `POST /auth/cli/device`(无需鉴权)→ 服务端生成 `device_code`(40+ 位,保密)
   与人类可读的 `user_code`(如 `WDJB-MJHT`),存 Redis(TTL ~15 min,记 `interval`),
   返回 `{ device_code, user_code, verification_uri, expires_in, interval }`。
2. CLI 打印 `user_code`,并打开浏览器到 `verification_uri`(如 `${WEB}/auth/cli`)。
3. 浏览器里:用户**已登录 web**(有 `infra.session` cookie)→ 直接进入批准页;**未登录**
   则先走现有 web OTP 流程拿到 cookie。这一步就是"复用浏览器登录态"。
4. 用户核对 `user_code` 后点批准 → web 页面携 cookie 调 `POST /auth/cli/device/approve`
   (cookie 鉴权 + CSRF 校验),服务端把该 `device_code` 标记为"已批准 + 绑定该用户",
   并复用 `session-service.issueTokens` 以 `platform: "cli"` 签发一对 Bearer/refresh、
   登记一个 device 行。**token 不经浏览器**,只落在服务端待取。
5. CLI 自始按 `interval` 轮询 `POST /auth/cli/device/token`(带 `device_code`):
   未批准返回 `authorization_pending`,过快返回 `slow_down`,过期 `expired_token`,
   用户取消 `access_denied`;批准后**单次**返回 token,随即作废 `device_code`。
6. CLI 拿到 token 写入凭据文件——与终端 OTP 登录殊途同归,后续 `refresh` 续期不变。

### 需要改动的面(跨包,需协调)

- `packages/shared/contracts/auth.ts`:新增 `/auth/cli/device`、`/auth/cli/device/token`
  的路由与请求/响应 schema,以及设备流错误码(`authorization_pending` / `slow_down` /
  `expired_token` / `access_denied`)。契约是唯一真源,属跨端变更。
- `apps/api`:三个动作(签发码 / 批准 / 换 token)+ Redis 里的 `device_code` 状态机
  (TTL、单次消费、`interval` 限速),复用 `session-service` 的令牌签发;`approve` 必须
  cookie 鉴权 + CSRF 防护。
- `apps/web`:新增 `/auth/cli` 批准页(确保登录 → 显示/核对 `user_code` → 批准)。
- `apps/cli`:`auth login --web` 子命令(取码 → 打开浏览器 → 按 `interval` 轮询)。

### 安全要点(评审重点)

- `device_code` 与 `user_code` 分离:前者保密仅 CLI 持有,后者短且给人核对;token 永不
  经浏览器地址栏或页面明文传递,只在轮询响应里单次下发。
- `approve` 端点的 CSRF 防护(cookie 会话可被跨站触发签发长期 token 的风险)。
- 轮询限速:强制 `interval`,`slow_down` 退避;`device_code` 短 TTL + 单次消费。
- 审计:该登录同样写 `login_event`,device 行 `platform = "cli"`。

在获得产品/安全确认后,再按上述设备流实现 `--web`;当前终端 OTP 登录已可独立使用。

### Sources

- GitHub Device Flow(端点、`device_code`/`user_code`、轮询与错误码):
  <https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps>
- `gh auth login` 走 device flow、无 localhost 回调而是轮询取 token:
  <https://cli.github.com/manual/gh_auth_login> ·
  <https://github.com/cli/cli/discussions/6291>
