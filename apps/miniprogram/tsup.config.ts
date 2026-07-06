import { defineConfig } from "tsup";

/**
 * Bundle each mini-program entry into a self-contained CommonJS module under
 * `miniprogram/`, inlining `@infra/sdk` (+ its `@infra/shared` deps) so the WeChat
 * runtime needs no `构建 npm` step. Output filenames follow the entry keys, landing
 * each page's `.js` next to its hand-authored `.wxml` / `.wxss` / `.json`.
 *
 * `clean` is OFF on purpose: the outDir also holds the authored view files, which
 * a clean would delete. `pnpm clean` removes only the emitted `*.js`.
 */
export default defineConfig({
  entry: {
    app: "src/app.ts",
    "pages/login/index": "src/pages/login.ts",
    "pages/todo/index": "src/pages/todo.ts",
    "pages/profile/index": "src/pages/profile.ts",
  },
  outDir: "miniprogram",
  format: ["cjs"],
  // The package is ESM (`"type":"module"`), which would make tsup emit `.cjs`; the
  // mini-program loader wants `pages/login/index.js` next to its `.wxml`, so pin `.js`.
  outExtension: () => ({ js: ".js" }),
  platform: "neutral",
  target: "es2019",
  splitting: false,
  // tsup externalizes package.json deps by default; the mini-program runtime can't
  // resolve `require("@infra/sdk")`, so force the workspace packages to be inlined.
  noExternal: [/^@infra\//],
  clean: false,
  dts: false,
  sourcemap: false,
  // @infra/shared's Zod schemas ride along (top-level z.object() calls block
  // tree-shaking) and get duplicated per entry. Minify to keep each page well under
  // the 2MB main-package cap. Follow-up: a single shared chunk / sideEffects:false.
  minify: true,
  // The mini-program loader executes each page module for its side effect
  // (`Page({...})` / `App({...})`); there are no re-exports to preserve.
  treeshake: true,
});
