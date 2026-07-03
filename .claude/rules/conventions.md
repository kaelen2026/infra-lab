# Conventions

Cross-cutting conventions. Per-language best practices (coding style + project
layering) live in their own rule: TypeScript → [`typescript.md`](typescript.md),
and iOS / Android / Harmony → [`ios.md`](ios.md) / [`android.md`](android.md) /
[`harmony.md`](harmony.md). Read the relevant one before touching that code.

- TypeScript ESM, `moduleResolution: "Bundler"`, `verbatimModuleSyntax` on (use `import type`).
- Biome formats & lints (2-space, double quotes, trailing commas, 100 cols). Pre-commit runs lint-staged;
  commit-msg enforces **Conventional Commits** (commitlint). Keep commit body lines ≤100 chars.
- `OTP_DEBUG_RETURN_CODE=true` returns the code in the request response — **dev only**; never in prod.
- **单个源文件目标 ≤ 500 行。** 这是可维护性启发式,不是硬门禁——超出时应优先按职责拆分
  (抽出组件 / 提取 service·repository / 拆分 route 模块),保持目录组织清晰、单文件单一职责,
  而不是简单地把代码搬到另一个文件凑数。约束的是**易维护**,行数只是信号。
  - **不同语言酌情处理**:声明式 UI(SwiftUI `View` / Compose / ArkTS 页面如
    `MainShell.ets`)因视图树天然偏长,可适度放宽;生成文件(`*.generated.*`、drizzle 迁移)
    与测试文件(`*.test.ts` 常含大量用例)不受此约束。
  - 新增或大改一个文件时若逼近该阈值,考虑拆分;既有超限文件不必为凑数强行重构,借后续
    相关改动顺带收敛即可。
