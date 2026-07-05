# 工作流规则

## 禁止直接在 main 提交代码

`main` 是受保护的默认分支,**禁止在 `main` 上直接 commit**。

- 任何代码改动都必须先从 `main` 切出特性分支再提交:
  - 命名约定:`feat/<简述>`、`fix/<简述>`、`ci/<简述>`、`docs/<简述>`、`chore/<简述>`。
  - `bot/<issue编号>-<slug>` **保留给 infra-lab-bot 的工单分支**(自动返工链 `rework.yml`
    靠此前缀识别),人类分支不要使用。
- 提交前必须确认当前不在 `main`:`git branch --show-current` 不得返回 `main`。
- 改动通过 **Pull Request** 合入 `main`,且必须通过 CI 质量门禁(lint / typecheck / build / test,见 `.github/workflows/ci.yml`)。
- 提交信息遵循 **Conventional Commits**(由 husky `commit-msg` + commitlint 强制)。

> 例外:仅当用户明确要求"就在 main 上提交"时才可破例,否则一律先建分支。

## 使用 worktree 开发特性分支(与主仓库目录平级)

特性分支在 **独立的 git worktree** 中开发。worktree 目录与主仓库目录 **平级**——放在
同一父目录下的兄弟目录,命名为 `<仓库名>-<端/简述>`,**不要**嵌套在主仓库内部。

当前有哪些 worktree 以 `git worktree list` 的实时输出为准——本文档不维护清单
(此处曾有一张硬编码的表,worktree 合并清理后即过时,故移除)。

约定:

- 创建:`git worktree add -b feat/<简述> ../infra-lab-<简述> <基线提交>`。
- 主仓库目录保持在基线分支;同一分支不能在多个 worktree 同时检出(git 会拒绝)。
- 查看:`git worktree list`。
- 清理:特性合并后,**删除 worktree 的同时一并删除分支**(分支不长期保留):
  - `git worktree remove ../infra-lab-<简述>`
  - `git branch -d feat/<简述>`(已合并;远端分支一并删除:`git push origin --delete feat/<简述>`)

## 动手前先盘点在途工作(多会话并行防撞)

多个 Claude 会话经常并行开发。**开始一个新任务前,必须先看一眼在途工作**,避免两个
会话各自实现同一功能、最后在归并上花掉比实现更多的成本(前车之鉴:#111 与 #117 分别
实现了 iOS deep link,归并还叠加了 #116 的目录重命名):

- `gh pr list` — 已开的 PR 里是否有与本任务重叠/相邻的改动;
- `git worktree list` — 是否已有会话在相关分支上开发(worktree 存在 ≈ 工作在途);
- 发现重叠时:**不要另起炉灶**。要么基于该分支继续,要么等它合并后再动手,要么与
  用户确认边界后只做不重叠的部分;
- 改动同一区域的多个 PR 合并前,先明确合并顺序,后合的一方负责归并
  (重命名/大范围移动类 PR 应尽量先合,避免其他分支全部撞上路径冲突)。
