<!--
标题遵循 Conventional Commits：<type>(<scope>): <简述>
  type：feat / fix / docs / style / refactor / perf / test / build / ci / chore
  scope：api / web / h5 / bot / ios / android / harmony / auth / db / shared / design / ci …
无关内容的模板注释（<!-- --> 包裹的说明）请随手删掉，只留下你实际填写的部分。
-->

## 背景 / 动机

<!-- 这个 PR 解决什么问题、为什么现在做。关联 issue 用 #编号（会自动关联）。 -->

Closes #

## 改动

<!-- 做了哪些改动，按模块/文件分点。只写“做了什么、为什么这么做”，diff 里能看到的细节不必赘述。 -->

-

## 影响面

<!-- 勾选本次 PR 触及的方面；勾上的在下面补一句具体说明，未触及的可删。 -->

- [ ] **跨端契约**：改了 `@infra/shared` 的 auth/todo 契约字段（名称/结构/JSON 形状）
      → 需同步 web / h5 / ios / android / harmony 各端，说明已同步哪些：
- [ ] **安全**：涉及 OTP / 限流 / 令牌 / 会话 / 鉴权路径
      → 确认无手机号、OTP、令牌落日志；限流与锁定语义未被绕过：
- [ ] **数据库**：改了 drizzle schema（需 `pnpm --filter @infra/db push` / 迁移）：
- [ ] **构建 / 配置**：改了 tsup / turbo / 环境变量 / CI / 依赖：
- [ ] **纯文档 / 内部改动**，无运行时影响

## 验证

<!-- 你实际跑了什么、结果如何。贴关键输出或结论；改动有运行面的（非纯文档）务必给出证据。 -->

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm build`
- [ ] `pnpm test`
- [ ] 端到端手动验证（说明验了哪条流程、结果）：
- [ ] 原生端本地门禁（若触及）：iOS `make lint` / Android `./gradlew detekt` / Harmony `codelinter`

## 自查

- [ ] 标题符合 Conventional Commits，提交信息正文行 ≤100 字符
- [ ] 未在 `main` 直接提交（本 PR 从特性分支发起）
- [ ] 生成产物（`pnpm gen:design` 的设计 token / copy）未手改，无 CI 漂移
- [ ] 未提交密钥 / `.env` / 令牌等敏感信息
