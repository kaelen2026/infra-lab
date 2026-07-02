# 安全巡检（security patrol）

本仓库有两层定时安全巡检，互补而非重叠：**工具查已知类问题，AI 查业务逻辑**。

| 层 | workflow | 频率 | 内容 | 结果去向 |
| --- | --- | --- | --- | --- |
| 确定性扫描 | [`security-scan.yml`](../.github/workflows/security-scan.yml) | 每日 03:00 UTC + PR/push(main) | gitleaks（密钥）、pnpm audit（依赖 CVE）、CodeQL（JS/TS SAST） | PR 上作门禁；定时失败开 issue + 飞书；CodeQL 进 Security 标签页 |
| AI 深度巡检 | [`security-patrol.yml`](../.github/workflows/security-patrol.yml) | 每周一 02:00 UTC | Opus 4.8 只读审计认证逻辑（见下） | 发现问题开 issue（贴 `security` 标签）+ 飞书；CLEAN 只推飞书心跳 |

两者都可在 Actions 页手动 `workflow_dispatch` 触发。

## 确定性扫描（security-scan.yml）

- **gitleaks** — 扫源码里的密钥 / 令牌。定时运行扫全量 git 历史，PR/push 扫当前树。SARIF 上传到 Security 标签页。
- **pnpm audit** — `pnpm audit --audit-level high`，只在 high/critical 漏洞时失败（本地等价命令：`pnpm security:audit`）。
  安装依赖用 `--ignore-scripts`，避免审计阶段执行第三方生命周期脚本。
- **CodeQL** — `javascript-typescript` + `security-extended` 规则集。CodeQL 走告警模型，
  结果进 **Security → Code scanning**，不直接让 build 失败；要拦合并需在分支保护里加 code scanning 门禁。

**门禁行为**：PR / push 上 gitleaks 或 pnpm audit 失败即拦截；定时运行任一失败时 `notify` job 会开 /
复用一个 `security` 标签的 issue 并推飞书（PR 失败不开 issue，避免噪声——checks 已经体现）。

## AI 深度巡检（security-patrol.yml）

复用 infra-lab-bot 的凭证跑 `claude-code-action`（Opus 4.8），按本项目威胁模型只读审计：
OTP 生成/有效期/一次性消费/重放、限流与锁定绕过、令牌与会话、密钥与配置（含 `OTP_DEBUG_RETURN_CODE`）、
日志泄密红线、契约漂移、workflow 权限与注入面、输入校验/越权。审计范围与输出格式见
[`.github/prompts/security-patrol.md`](../.github/prompts/security-patrol.md)。

巡检报告首行是机器可读状态 `SECURITY_PATROL_STATUS: CLEAN|FINDINGS`：
`FINDINGS` 时开一个 `security` 标签的 issue 并推飞书；`CLEAN` 不开 issue，只推一条飞书周报心跳。
`FINDINGS` 时第二行是分区标记 `SECURITY_PATROL_AREAS: otp,logging,…`（8 个区域对应巡检范围 8 项），
决定通知 @ 谁（见下节）。巡检**只读**——不改文件、不提交、不开 PR，issue / 通知全由 workflow 侧确定性完成。

## 通知 @ 负责人（security-owners.json）

[`.github/security-owners.json`](../.github/security-owners.json) 是「分区 → 负责人」映射表：

- **巡检**（patrol）：workflow 解析报告的 `SECURITY_PATROL_AREAS` 标记 → 按表取负责人 →
  飞书卡片末尾用 `<at id=open_id></at>` **真实 @**（红点提醒），GitHub issue 正文追加 `cc @github用户名`。
  解析不到分区、或某区未配置（`null`）→ 一律落 `default`，宁可 @ 不精准，不漏通知；
  `CLEAN` 不 @ 任何人。
- **扫描**（scan）：每日扫描失败没有分区概念，飞书与 issue 都 @ `default` 负责人。

给某个区指派负责人：把 `areas.<区域>` 从 `null` 改成
`{ "name": "…", "feishu_open_id": "ou_…", "github": "…" }`。
`feishu_open_id` 是**本飞书应用视角**的 open_id（按应用隔离）——最省事的拿法：
让负责人**私聊 bot 发一句话**，`apps/bot` 日志里 `receive_v1` 的 `sender_open_id` 就是，
无需申请通讯录权限。

## 需要配置的 secrets / vars

沿用 infra-lab-bot 已有的凭证，只新增一个可选的飞书目标 chat：

| 名称 | 类型 | 用途 | security-scan | security-patrol |
| --- | --- | --- | :---: | :---: |
| `CLAUDE_CODE_OAUTH_TOKEN` | secret | Claude 鉴权 | — | ✅ |
| `INFRA_LAB_BOT_PRIVATE_KEY` | secret | 开 issue 归属到 infra-lab-bot[bot]（App Client ID 是公开值，内联在工作流里） | — | ✅ |
| `LARK_APP_ID` / `LARK_APP_SECRET` | secret | 飞书应用凭证 | 可选 | 可选 |
| `LARK_DOMAIN` | var | `Feishu`（默认）/ `Lark` | 可选 | 可选 |
| `SECURITY_PATROL_CHAT_ID` | var | 飞书目标 chat_id | 可选 | 可选 |

飞书为**可选增强**：未配置 `SECURITY_PATROL_CHAT_ID` 时通知步骤自行跳过，不影响扫描 / 巡检本身。
`security-scan` 的 gitleaks / audit / CodeQL 与 issue 通知只用内置 `GITHUB_TOKEN`，无需额外 secret。

### 飞书 chat_id 怎么拿

把 infra-lab-bot 对应的飞书应用拉进目标群，用应用凭证调
`GET /open-apis/im/v1/chats`（`tenant_access_token` 鉴权）即可列出机器人所在群的 `chat_id`，
填进仓库 **Settings → Variables** 的 `SECURITY_PATROL_CHAT_ID`。飞书通知复用
[`.github/scripts/feishu-notify.mjs`](../.github/scripts/feishu-notify.mjs)（主动发新卡片，
区别于回帖的 `feishu-reply.mjs`）。
