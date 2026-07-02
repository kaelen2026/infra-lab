# 与 infra-lab-bot 协作

`infra-lab-bot` 是本仓库的 AI 助手，运行在 GitHub Actions 上（[`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action)），
模型为 **Claude Opus 4.8**，以自定义 GitHub App 身份 `infra-lab-bot[bot]` 发言。

## 触发方式

| 方式 | 怎么用 | 结果落在哪 |
| --- | --- | --- |
| **评论提及**（tag 模式） | 在 issue 评论、PR 评论或 PR 行内评论里写 `@infra-lab-bot <你的问题>` | 以 `infra-lab-bot[bot]` 身份**在同一线程回复** |
| **手动派发**（dispatch） | `gh workflow run infra-lab-bot.yml -f prompt="..."`，或 Actions 页面点 “Run workflow” | 无线程，**结果在该次运行日志里**（`show_full_output` 仅对 dispatch 开启） |
| **飞书 @**（`@infra/bot`） | 在飞书群 @ bot 或私聊它 | bot 先 react + 安抚，再 dispatch 本工作流；跑完**把结果回帖到发起消息的飞书 thread** |
| **工单接单**（label） | 给 issue 打上 **`bot` 标签** | bot 在 issue 里评论开工计划 → 切 `bot/<编号>-<slug>` 分支实施 → 开 PR（`Closes #N`）并回帖链接；之后自动返工链接手（见下节） |

示例：

```bash
# 线程里提及
@infra-lab-bot 解释一下 OTP 验证流程，涉及哪些文件？
@infra-lab-bot 审查这个 PR 的改动，有没有安全问题？

# 手动派发（prompt 可以很短，会和基础模板组合）
gh workflow run infra-lab-bot.yml -f prompt="分析当前项目架构与主要风险"
```

## 多轮会话如何保持上下文

**每次触发都是一次独立运行，运行之间没有持久会话或记忆。** 上下文是这样来的：

- **tag 模式**：每次被 @ 时，它会**重新读取整个 issue / PR**——标题、正文、**全部历史评论**，以及（PR 场景）改动文件和 diff。所以只要**留在同一个线程里继续 @**，它就“记得”前面聊过什么。线程本身就是它的记忆载体。
- **换一个新 issue、或用 dispatch** → 从零开始，不带任何历史。dispatch 没有线程，需要的信息要**全部写进 prompt**。
- **常驻背景**（每次运行都会注入）：[`CLAUDE.md`](../CLAUDE.md)、[`.claude/docs/architecture.md`](../.claude/docs/architecture.md)、以及机器人的基础提示词 [`.github/prompts/infra-lab-bot.md`](../.github/prompts/infra-lab-bot.md)。
- 单次运行**内部**的多步推理（日志里的 `num_turns`）是真·连续对话，但只活在这一次运行里。
- 上下文窗口 100 万 token，正常长度的线程都塞得下。

一句话：**同一线程内继续对话 = 保持上下文；跨线程 / dispatch = 从头开始。**

## 它会做什么、不会做什么

- **默认只读分析**：答疑、排查、审查、给建议。除非你**明确要求**改代码，它不会动文件。
- **改代码时遵守仓库规则**：走特性分支 + PR，遵循 Conventional Commits，**绝不直接提交 `main`**。
- **安全边界**：绝不输出密钥、令牌、`.env` 或 CI secrets；不做破坏性或对外请求操作（除非明确授权）。
- 结论基于仓库真实代码，不确定会直说，并尽量给出 `路径:行号` 出处。

这些约束定义在 [`.github/prompts/infra-lab-bot.md`](../.github/prompts/infra-lab-bot.md)，可按需调整。

## 用好它的小贴士

- **想让它记住上下文，就留在同一个 issue / PR 线程**里追问。
- 一次把一件事问清楚；需要背景时一次给足，别指望它跨线程记忆。
- dispatch 的 prompt 可以很短——它会和基础模板自动组合，但**背景信息要写全**，因为没有线程可读。
- 要它改代码时，明确说“开分支 + 提 PR”，并说清验收标准。

## 工单生命周期（label 接单 → 自动返工 → 人只批合并）

给一个 issue 打上 **`bot` 标签**即完成派单，之后全自动：

1. **接单**（`infra-lab-bot.yml`）：bot 读 issue 与全部评论，在 issue 里评论开工计划；
   需求不清则评论追问并停（不开分支、不开 PR）。
2. **实施**：从最新 `main` 切 `bot/<issue编号>-<slug>` 分支，本地自检
   （lint / typecheck / build / test）后开 PR（`Closes #N`），回 issue 贴 PR 链接。
3. **审查与返工**（`rework.yml`）：每次 push 后 CI + reviewer 自动跑；reviewer 顶层总结
   末行输出 `VERDICT: LGTM|REWORK`。rework 在 **CI 与 reviewer 都出结论**后决策：
   CI 非绿或 REWORK（或解析不到判定——宁可多跑，不静默漏单）→ bot 自动处理审查意见、
   修红灯并 push，触发下一轮审查。
4. **刹车**：每个 PR 最多自动返工 **2 轮**（PR 标签 `bot-rework:1/2` 计数）。超限或运行失败，
   bot 评论 @ 维护者并停。想再给一轮：**摘掉 `bot-rework:*` 标签**，然后重跑 reviewer
   （或 push 任意提交）。
5. **合并**：始终由人批准——bot 是 PR 作者，无法满足分支保护的审批要求；
   这是制度保证，不依赖 prompt 约束。

约定与边界：

- `bot/*` 分支前缀是返工链的识别标志，人类分支不要使用（见 `.claude/rules/workflow.md`）。
- reviewer **运行崩溃**（run 失败，不是漏写判定）时返工链不动作——失败检查在 PR 上可见，由人处理。
- `rework.yml` 走 `workflow_run`，只在文件位于 `main` 上时生效（合入后闭环才通电）。
- 依赖三个仓库标签：`bot`、`bot-rework:1`、`bot-rework:2`（一次性 `gh label create`）。

## 维护者参考

| 项 | 位置 / 值 |
| --- | --- |
| 工作流 | [`.github/workflows/infra-lab-bot.yml`](../.github/workflows/infra-lab-bot.yml) |
| 返工工作流 | [`.github/workflows/rework.yml`](../.github/workflows/rework.yml) |
| 基础提示词 | [`.github/prompts/infra-lab-bot.md`](../.github/prompts/infra-lab-bot.md) |
| 工单 / 返工提示词 | [`.github/prompts/ticket.md`](../.github/prompts/ticket.md) / [`.github/prompts/rework.md`](../.github/prompts/rework.md) |
| 工单标签 | `bot`（接单）；`bot-rework:1/2`（返工轮次计数，rework.yml 自动打） |
| 触发短语 | `@infra-lab-bot` |
| Claude 鉴权 | `CLAUDE_CODE_OAUTH_TOKEN`（secret，`claude setup-token` 生成） |
| GitHub 身份 | 自定义 App `infra-lab-bot`：Client ID `Iv23liQcsfKzRONudnfm`（公开值，内联在工作流里）+ secret `INFRA_LAB_BOT_PRIVATE_KEY`（私钥） |
| 飞书回帖 | secrets `LARK_APP_ID` / `LARK_APP_SECRET`（可选 var `LARK_DOMAIN`）；回帖脚本 [`.github/scripts/feishu-reply.mjs`](../.github/scripts/feishu-reply.mjs) |
| 修改模型 / 参数 | 工作流里的 `claude_args`（如 `--model claude-opus-4-8`） |

> App 需安装到本仓库，并授予 Contents / Issues / Pull requests 读写权限，否则 token 交换会 404。

## 飞书闭环（`@infra/bot`）

[`apps/bot`](../apps/bot) 的接待 bot 在飞书收消息后，用 `workflow_dispatch` 触发本工作流，
并透传 `feishu_message_id`（发起消息的 id）。本工作流跑完后，`Reply result to Feishu thread`
步骤调 [`.github/scripts/feishu-reply.mjs`](../.github/scripts/feishu-reply.mjs)，从
claude-code-action 的 `execution_file` 取最终文本，`reply_in_thread` 回帖到同一 thread，闭环。

- 仅当 `feishu_message_id` 非空时回帖；人工 dispatch（不带该输入）自动跳过。
- 需要仓库 secrets `LARK_APP_ID` / `LARK_APP_SECRET`（与 `apps/bot` 用的是同一飞书应用）。
