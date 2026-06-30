# Build / typecheck rules (important)

- **Build is tsup, not tsc.** `tsconfig.base.json` sets `"noEmit": true` and the root `tsconfig.json`
  is intentionally **not** a `tsc -b` solution (no `references`). **Never run `tsc -b`** — it emits
  `.js`/`.d.ts` files into the source tree and breaks `rootDir`. Type-check only via `pnpm typecheck`.
- **Intra-package relative re-exports in `@infra/shared` must be extensionless** (`./contracts/auth`,
  not `./contracts/auth.js`). The Next.js app resolves `@infra/shared` to source via a tsconfig path
  alias, and Turbopack cannot resolve `.js`→`.ts`. Other packages may use `.js` (Vite/tsc/tsup handle it).
- Tests resolve `@infra/*` to **source** via aliases in `vitest.config.ts`; the API/web tsconfigs use
  matching `paths`. Production code resolves `@infra/*` to built `dist` via each package's `exports`,
  so **packages must be built before the API can run** (`pnpm build` is topological).
