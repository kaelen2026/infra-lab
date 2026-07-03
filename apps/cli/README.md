# `@infra/cli` — 终端客户端

`infra-lab` 是本项目的命令行客户端:用手机号 + OTP 登录(登录即注册),把会话
持久化到本地凭据文件,后续命令直接复用。它**不是新平台的重写**——作为一个没有
cookie jar 的客户端,它复用 `@infra/sdk` 的 Bearer 传输(`platform: "cli"`,与
iOS/Android/Harmony 同一条 native 通道),只是把 Keychain/Keystore/HUKS 换成桌面
等价物:一份 `0600` 权限的 JSON 凭据文件。

## 使用

```bash
pnpm --filter @infra/cli build            # 产出 dist/index.js(带 shebang)
node apps/cli/dist/index.js auth login    # 或 pnpm --filter @infra/cli dev auth login

infra-lab auth login       # 交互式登录(输入手机号 → 收到验证码 → 输入验证码)
infra-lab auth whoami      # 查看当前登录用户(access token 过期会自动 refresh 一次)
infra-lab auth logout      # 退出登录并清除本地凭据
infra-lab todo list        # 列出待办
infra-lab todo add 买牛奶   # 新建待办
infra-lab todo done <id>   # 标记完成
infra-lab todo rm <id>     # 删除待办
```

`login` 成功后,SDK 会把返回的 Bearer + refresh token 写入凭据文件;之后每条命令
加载它并在需要时静默续期(`/auth/refresh` 轮换),这就是"复用会话状态"。

## 配置

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `INFRA_LAB_API_URL` | API 基址 | `http://localhost:3001` |
| `XDG_CONFIG_HOME` | 凭据目录基址 | `~/.config` |
| `--api <url>` | 单次覆盖 API 基址 | — |

凭据落盘位置:`$XDG_CONFIG_HOME/infra-lab/credentials.json`(`0600`);稳定的
安装标识:`.../device.json`(登录时作为 `device.deviceId` 上报,账户页可像其他端
一样列出这台终端)。

## 结构(ports & adapters)

- `config.ts` — 路径/URL 解析(注入 `env`,纯函数)。
- `token-store.ts` — 文件版 `TokenStore`(实现 `@infra/sdk` 的接口)。
- `client.ts` — 用 `platform: "cli"` 组装 `AuthClient`/`TodoClient`,并提供 401
  自动 refresh 的 `withRefresh` 包装。
- `commands/*.ts` — 命令逻辑,依赖注入(`AuthClient`/`TodoClient`/`CliIO`),因此
  测试完全 hermetic(`test/` 下用假 client + 假 IO 驱动,不触网络、不碰真实 home)。
- `index.ts` — argv 解析(`node:util` parseArgs)与派发;`run()` 可被测试直接调用。

## 浏览器辅助登录("打开浏览器复用状态")

原始需求还提到「打开浏览器复用状态」。web 会话是 **HttpOnly cookie**,独立的 CLI
进程读不到浏览器的 cookie jar,所以要把浏览器里的登录态"交接"给 CLI,需要新增一个
loopback + 令牌交接端点(cookie 会话 → CLI 的 Bearer/refresh),这是一处**新的、需
安全评审的认证面**。设计已写在
[`docs/plans/cli-plan.md`](../../docs/plans/cli-plan.md),作为待定的下一步,未在本次
落地——当前 `auth login` 走终端 OTP,不依赖任何新增 API。
