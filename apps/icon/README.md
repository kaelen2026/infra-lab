# @infra/icon

浏览器端 App 图标生成器(iOS / Android / HarmonyOS / web·PWA / Expo / 桌面图标包)。
把前景(图片上传、文字、emoji 或 Lucide 图标)叠加在背景与形状之上,用 Canvas 实时预览,
再在浏览器里一键导出多平台 ZIP。**纯前端**——没有后端、数据库、认证或上传路径,因此不依赖
`@infra/{auth,redis,db,sdk,shared}`,是本 monorepo 里唯一的独立静态站点。

## 开发

```sh
pnpm --filter @infra/icon dev     # http://localhost:3003
```

端口分配:web `:3000`、api `:3001`、h5 `:3002`、icon `:3003`。

## 质量门禁(接入根 CI)

```sh
pnpm --filter @infra/icon typecheck   # next typegen + tsc --noEmit
pnpm --filter @infra/icon build       # next build
pnpm --filter @infra/icon test        # vitest run(happy-dom,单测 + 组件测试)
pnpm lint                             # 根 biome check(全仓库)
```

- **lint / typecheck / build** 走仓库统一的 turbo + 根 biome 流程。
- **test** 由本应用**独立的 vitest 配置**(happy-dom 环境)承载,不并入根级 node 环境的
  hermetic 测试;CI 用 `pnpm --filter @infra/icon test` 单独跑。
- **e2e**(Playwright)可本地跑 `pnpm --filter @infra/icon test:e2e`,**不进 CI**(需浏览器 runner)。
- **coverage**:`pnpm --filter @infra/icon test:coverage`(单测 70% / 组件 80% 阈值)。

## 架构

- `src/types/icon.ts` — `IconConfig`,设计状态的唯一事实源。
- `src/components/IconStudio.tsx` — 持有 config 状态、历史、持久化、保存的设计、导入/导出状态与面板组合。
- `src/lib/renderIcon.ts` — 实时预览与离屏导出共用的 Canvas 渲染器。
- `src/modules/exporting/lib/exportPresets.ts` — 声明式平台注册表,导出面板文件清单、ZIP 内容、
  README 段落与平台元数据都从它派生。
- `src/modules/exporting/lib/exportZip.ts` — 渲染选定平台资源并在浏览器里打包 ZIP。

更多细节见 [`docs/architecture.md`](docs/architecture.md)、[`docs/design-system.md`](docs/design-system.md)、
[`docs/testing.md`](docs/testing.md)。

## 站点身份

`src/lib/site.ts` 是元数据、robots、sitemap、manifest、JSON-LD 共享的站点身份;
`NEXT_PUBLIC_SITE_URL` 可按环境覆盖域名。

## 部署 / CI-CD

icon 是**纯前端独立静态站点**(Next.js,无后端/认证/上传),因此它的部署与主服务层
**解耦**,当前**未纳入** [`deploy.yml`](../../.github/workflows/deploy.yml)。

- **质量门禁**:走仓库 CI(见上文「质量门禁」;component/unit test 用本应用独立 vitest,
  CI 里 `pnpm --filter @infra/icon test` 单独跑)。
- **托管**:它是标准 Next.js 应用(已用 `@vercel/analytics`),推荐 **Vercel**(与
  `apps/web` 同家,免费 Hobby 层)。要接入 CD,可按 `apps/web` 的
  [`deploy-web`](../../.github/workflows/deploy.yml) 模式新增一个 `deploy-icon` job:
  独立的 Vercel 项目、Root Directory 设为 `apps/icon`、按环境设 `NEXT_PUBLIC_SITE_URL`,
  用一个 `DEPLOY_ICON=true` 仓库变量门禁。
- 因为没有后端,它**不依赖**任何 secret/域名,除了展示用的 `NEXT_PUBLIC_SITE_URL`。
