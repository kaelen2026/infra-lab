# 用户隐私协议 + 用户服务协议(跨端)

## 目标

新增两份法律文档 —— **用户隐私协议**(privacy)与 **用户服务协议**(terms),由 **h5 端承载**
渲染后的页面,其余各端(web / iOS / Android / Harmony)**引用同一份来源**,保证措辞与路由零漂移。

## 设计取舍:一份来源,两种"引用"方式

沿用仓库既有的两个先例:

- **文案单一来源**:跨端文案统一放 `@infra/design`(如 `COPY`);其中 `COPY.timelineShare` 是
  "仅 h5/web 消费、不下发原生端"的先例。
- **URL/路径单一来源**:跨端 URL 放 `@infra/shared`(如 `timelineSharePath` / `timelineAppLink`)。

据此,协议正文与 URL 各归其位:

| 关注点 | 归属 | 文件 |
| --- | --- | --- |
| 文档正文(标题 / 引言 / 分节) | `@infra/design` | `packages/design/src/legal.ts` → `LEGAL_DOCS` |
| 路由路径 + URL 构造 | `@infra/shared` | `packages/shared/src/contracts/legal.ts` |
| 登录页同意文案 + 链接文字 | `@infra/design` | `COPY.legal`(h5/web-only,同 `timelineShare`) |

两种客户端因能力不同,采用两种"引用":

1. **TS 端(h5 / web)** 直接 `import { LEGAL_DOCS }`,各自渲染同一份内容 —— 这是真正的"代码级引用"。
   - h5 是**规范宿主**:`/legal/privacy`、`/legal/terms` 两个公开路由(在 `RequireAuth` 之外,
     与 `/t/:id` 同级)。
   - web 渲染同一 `LEGAL_DOCS`:`app/legal/privacy`、`app/legal/terms`。
2. **原生端(iOS / Android / Harmony)** 无法 import TS,改为通过 `@infra/shared` 的
   `legalUrl(base, kind)` 构造 h5 托管 URL,在浏览器 / WebView 中打开 —— 与"时间线分享链接由原生端
   打开 h5 `/t/:id`"完全对称。

## `@infra/shared` 契约(`contracts/legal.ts`)

```ts
LEGAL_DOC_KINDS = ["privacy", "terms"] as const;   // → type LegalDocKind
LEGAL_ROUTES = { privacy: "/legal/privacy", terms: "/legal/terms" };
legalPath(kind): string        // 应用内路径
legalUrl(base, kind): string   // 绝对 URL,给原生端 / 需要跳出的场景;自动去掉 base 末尾的 /
```

已挂载单测 `packages/shared/test/legal.test.ts`(hermetic)。

## 各端落地

- **h5**(已实现):`features/legal/legal-page.tsx` 按 `kind` 渲染 `LEGAL_DOCS[kind]`;`App.tsx`
  注册两条公开路由;登录页底部新增"登录 / 注册即代表你已阅读并同意《用户服务协议》和《隐私协议》"
  的同意行(链接用 `LEGAL_ROUTES`)。
- **web**(已实现):`features/legal/legal-page.tsx` + `app/legal/{privacy,terms}/page.tsx` 渲染同一
  来源;登录页底部同样新增同意行。
- **原生端**(后续,本 PR 未改代码):在各端登录页底部加同样的同意行,点击用系统浏览器 / WebView
  打开 `legalUrl(<h5 公开 URL>, kind)`。需要一个"h5 公开 URL"配置项(iOS/Android/Harmony 目前只有
  API base,没有 h5 web base)。**原生端质量门禁是本地的(不在 CI)**,须在本地跑各自的 lint
  (`make lint` / `./gradlew detekt` / `codelinter`)后再合入,故从本 PR 拆出。

## 部署要求

h5 是 SPA + `BrowserRouter`,宿主须对未匹配路径回退 `index.html`(见 `apps/h5/docs/deployment.md`),
新增的 `/legal/*` 深链无需额外配置即可访问。

## 注意

`packages/design/src/legal.ts` 与 `COPY.legal` 均**不经 `generate.ts` 下发原生端**(`generate.ts`
只读取固定的 auth 相关 key,不会拾取新增导出),故不产生 native 生成物漂移。

## 待办

- [ ] 正文为通用模板措辞,正式对外前须经法务 / 合规审阅并按实际数据处理情况调整。
- [ ] 原生三端接入同意行 + `legalUrl` 跳转(需新增 h5 web base 配置),本地 lint 后单独提 PR。
