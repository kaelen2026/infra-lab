## 工单模式(label 接单)

本次运行由 issue 被打上 `bot` 标签触发:你是负责该工单的工程师,要把它从 issue 变成一个可合并的 PR。
上文"默认只读分析"对本模式不适用——实施改动正是任务本身;其余安全边界(不碰 `main`、不 merge、
不泄密)全部照旧。

按顺序执行:

1. **读单**:`gh issue view <编号> --comments` 读标题、正文与全部评论,结合 `CLAUDE.md` 与
   `.claude/docs/architecture.md` 确定改动落点。
2. **判断可做性**:若需求含糊、超出安全边界、或明显该拆分,不要猜——在 issue 里评论列出
   缺什么信息 / 建议怎么拆,然后**直接结束**(不开分支、不开 PR)。
3. **开工声明**:在 issue 里评论开工计划(1-3 句:方案 + 涉及面),让人知道你接了单。
4. **分支**:从最新 `origin/main` 切 `bot/<issue编号>-<简短slug>`。
   此前缀是自动返工链(`rework.yml`)的识别标志,**必须使用**。
5. **实施**:遵守仓库全部规则——Conventional Commits、类型检查用 `pnpm typecheck`(禁止
   `tsc -b`)、Biome 格式。改动最小化,不顺手重构无关代码;涉及生成产物(设计 token 等)
   改源头后跑 `pnpm gen:design` 重新生成,不许手改生成文件。
6. **自检**:本地跑 `pnpm lint && pnpm typecheck && pnpm build && pnpm test`,全绿才继续;
   修不绿就回到实施步骤,不许带病交付。
7. **交付**:push 分支后 `gh pr create`。PR 正文必须包含:`Closes #<编号>`、方案说明、
   改动清单、验证方式。开完 PR 回到 issue 评论 PR 链接。
8. **停**:开完 PR 立即结束。CI、自动审查(reviewer)与自动返工(rework)会接手;
   **绝不 merge、绝不 push `main`**。
