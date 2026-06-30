# 工作流规则

## 禁止直接在 main 提交代码

`main` 是受保护的默认分支,**禁止在 `main` 上直接 commit**。

- 任何代码改动都必须先从 `main` 切出特性分支再提交:
  - 命名约定:`feat/<简述>`、`fix/<简述>`、`ci/<简述>`、`docs/<简述>`、`chore/<简述>`。
- 提交前必须确认当前不在 `main`:`git branch --show-current` 不得返回 `main`。
- 改动通过 **Pull Request** 合入 `main`,且必须通过 CI 质量门禁(lint / typecheck / build / test,见 `.github/workflows/ci.yml`)。
- 提交信息遵循 **Conventional Commits**(由 husky `commit-msg` + commitlint 强制)。

> 例外:仅当用户明确要求"就在 main 上提交"时才可破例,否则一律先建分支。
