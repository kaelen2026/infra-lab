# ONBOARDING — infra-lab 的 subagent 编排怎么用

这份是给**新会话 / 接手的人**的实操 playbook:怎么把一个真实任务跑完整个编排 loop。
权威规则在 [`CLAUDE.md`](CLAUDE.md)「工作模式 / 编排」段(每个会话自动加载),这里讲**怎么用**。

> 仓库是什么:pnpm-workspace monorepo,手机号 + OTP 认证(login == register,Better Auth 为核),
> 服务 web / ios / android / harmony / cli 五端(+ h5 / miniprogram / bot)。全景见
> [`.claude/docs/architecture.md`](.claude/docs/architecture.md)。

## 一句话原则

**主 agent 只编排,不把所有活儿在自己身上串行干完。** 一个完整 loop 由 `.claude/agents/` 里的
任务 subagent 分工完成,每一步都有**可验证的标准**(客观门禁通过、契约一致),不是"看起来对就收尾"。

## subagent 花名册

| 角色 | 干什么 | 门禁 |
|---|---|---|
| **explorer** | 只读侦察,测绘改动面:动哪些文件/端/契约、守哪些不变量、**基线能否过门禁** | — |
| **ts-implementer** | `packages/*` + `apps/{api,web,h5,bot,cli,miniprogram}`,TDD 落地 | CI 四关 |
| **ios / android / harmony-implementer** | 对应原生端,TDD 落地 | 本地(`make lint` / `detekt` / `codelinter`) |
| **verifier** | **真跑**门禁给 PASS/FAIL,不改码 | — |
| **reviewer** | 对抗式审 diff 红线(密钥/分层/契约漂移/force-unwrap…),不改码 | — |

## 一个任务怎么跑(标准流水)

```
explorer 侦察 → (plan) → implementer 落地 → verifier 真跑门禁 → reviewer 审红线 → 建分支 + commit + PR
```

- **独立子任务一条消息并发派发**(fan-out);有依赖的按上面流水串。
- 主 agent 保留**结论**而非文件堆。
- **loop 自己驱动到底**,不在每个 gate 停下等确认。

### 只在两种时刻停下来找用户
1. **决策分叉** —— 需求有歧义、多个合理方案要选、要动不可逆/对外动作(删数据、发布上线、force-push)、
   跨端契约变更、安全敏感面。
2. **最终结果** —— 任务完成,或遇到自己无法推进的阻塞。

gate 失败(verifier FAIL / reviewer 报红线)是 **loop 内部事件**:自己派对应端 implementer 返工再验,
不必回来请示。

## 硬纪律(自治不豁免)

- **禁止在 `main` 直接 commit** —— 先建特性分支(`feat/` `fix/` `docs/` `chore/` `ci/`),在**平级 worktree**
  里开发(`git worktree add -b feat/x ../infra-lab-x main`),走 PR + CI 合入。
- **动手前盘点在途工作**:`gh pr list` + `git worktree list`,别和别的会话撞车。
- **Contracts 是唯一事实源**(`packages/shared/src/contracts/`),改契约是跨端变更,要同步各端镜像。
- **fan-out 实现前先确认基线绿**:基线本身不过门禁 / 不绿编译时,先修基线、合入干净基线再派实现
  (下面范例就踩过这个坑)。
- Conventional Commits(commitlint 强制);TS 侧 strict、无 `any`/`!`;原生端 no force-unwrap / no print;
  绝不 log 手机号/OTP/token;Generated 文件只由 `pnpm gen:design` 生成,不手改。

## 一个真实范例:iOS 接入 Google 登录

1. **explorer** 把"从零接入"缩成"照已有 Apple 登录镜像 Google";揪出后端受众缺口。
2. 并发 fan-out:**ts-implementer**(后端 idToken 受众)‖ **ios-implementer**(逻辑层端口化)。
3. iOS agent 干到一半撞出 **main 上一个预存的 iOS 编译坡**(账号绑定错误码漏镜像)——
   **教训:explorer 当时没试编译。** 决策分叉上报用户 → 单独修、合入干净基线 → rebase 特性分支继续。
4. **ios-implementer** 落地登录页社交优先重排 + Google 按钮 + SPM 接入 + 门控。
5. **verifier ‖ reviewer** 并发:门禁全绿 + 零 blocker → 开 PR 合入。

**复盘提速点**(已写进 CLAUDE.md):① fan-out 前先跑一次基线 build,别让 agent 撞预存坡白烧工时;
② 原生端 build/test 循环慢,implementer 迭代期跑窄测试 target、收尾再全量。

## 更大规模

需要多轮 fan-out + 对抗式验证 + 综合,**且用户明确要 workflow** 时,才上 Workflow 工具;否则用
单个 Agent 派发。
