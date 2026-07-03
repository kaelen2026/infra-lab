# TypeScript coding rules (`packages/*` + `apps/{api,web,h5,bot}`)

Read before touching TS code — this is the core of the monorepo, so it carries
the depth the native-client rules have. The quality gate here is **CI**
(`lint · typecheck · build · test`, `.github/workflows/ci.yml`), unlike the
native clients whose gate is local. Biome + strict `tsc` enforce most of the
below; the rest is architecture the tooling can't check.

## Language & safety

- **Strict everything, don't weaken it.** `tsconfig.base.json` sets `strict`
  plus `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`,
  `noImplicitOverride`. Every package `extends` it and only adds `paths` — never
  relax a flag per package.
- **`noUncheckedIndexedAccess` means index access is `T | undefined`.** Narrow it
  (`?.`, `if`, `?:`) rather than asserting. Model absence with `?` / `| null` and
  unwrap explicitly; no `!` non-null assertions in app code (Biome relaxes
  `noNonNullAssertion` only in test files).
- **No `any`** (Biome `recommended` bans `noExplicitAny`; relaxed in tests only).
  Give explicit return types on exported functions.
- **`verbatimModuleSyntax` is on** — use `import type` for type-only imports, or
  `isolatedModules` breaks the build. Cross-package imports go through `@infra/*`;
  intra-package relative imports use the `.js` suffix (the one exception is
  `@infra/shared`'s re-exports — see `build-and-typecheck.md`).
- **Derive types, don't duplicate them.** `type X = z.infer<typeof xSchema>` from
  the Zod schema; derive union types from `as const` tuples
  (`AUTH_ERROR_CODES` → `AuthErrorCode`). Constants are `UPPER_SNAKE … as const`
  (`OTP_LIMITS`, `AUTH_ROUTES`, `OTP_KEYS`).

## Project layering (ports & adapters)

- **Two tiers, arrows point inward.** `packages/*` are libraries (`@infra/*`);
  `apps/*` are deployables. Apps depend on packages, never the reverse; a package
  never imports an app. Web/H5 depend only on `@infra/sdk` + `@infra/shared` —
  **never** on `@infra/{auth,redis,db}`.
- **Domain defines ports; adapters depend on the domain.** `packages/auth`
  declares the `OtpStore` port and imports no Redis driver; `@infra/redis`
  `implements` it and therefore depends on `@infra/auth` (not the reverse).
  Depend on the port interface, never the concrete adapter.
- **Contracts are the single source of truth.**
  `packages/shared/src/contracts/<domain>.ts` holds the Zod request schemas,
  DTOs, error codes, limit constants and route paths that every client and route
  imports. Changing a contract is a cross-client change — coordinate all four
  clients (see [`.claude/docs/architecture.md`](../docs/architecture.md)).
- **Inject collaborators via factory functions.** `createOtpService(deps)`,
  `createAuthRoutes(deps)`, `createTodoRepository(db)` take their collaborators as
  arguments — that DI shape is what makes the tests hermetic. Ports live where
  they are consumed: domain ports in the domain package, route-scoped ports (e.g.
  `TodoRepository`) in the `*.routes.ts` file, with the repository adapter
  `implements`ing them via an `import type` back-reference.

## Async & errors

- **Domain layers return discriminated unions, not thrown exceptions,** for
  expected failures: `{ ok: true, … } | { ok: false, error, … }`
  (`RequestCodeResult`, `VerifyCodeResult`). Callers narrow on `.ok`.
- **Boundaries translate errors to their transport.** Routes map the domain error
  code to an HTTP status via `ERROR_STATUS` (cooldown/limits → 429, LOCKED → 423,
  invalid/expired/unauthorized → 401); the SDK throws a typed `HttpAuthError`
  (`code` / `status` / `retryAfter` / `remainingAttempts`) on any non-2xx. Don't
  leak raw driver errors across a boundary.
- **`await` every promise** — no floating promises; don't fire-and-forget in the
  token/refresh or OTP path.

## Secrets & logging

- **Never log phone numbers, OTP codes, or tokens.** Use the structured logger
  (`apps/api/src/observability/logger.ts`): it deliberately has no body/credential
  logging, and access logs carry only `{ method, path, status, durationMs, ip }`.
  One `requestId` per request (`x-request-id` propagated).
- OTP codes are stored only as HMAC-SHA256 hashes (`OTP_SECRET`) and deleted on
  success (single-use). `OTP_DEBUG_RETURN_CODE=true` echoes the code in the
  response — **dev only, never prod** (see `conventions.md`).

## Testing

- **Hermetic — no live Redis/PG.** `pnpm test` (vitest) resolves `@infra/*` to
  source via aliases and injects fakes: `FakeRedis` (virtual-clock, in
  `@infra/auth/testing`), `FakeTodoRepository`, a switchable `fakeRequireUser`.
  Tests live in each package's `test/` dir (`packages/**/test`, `apps/**/test`).
- Because production resolves `@infra/*` to built `dist`, **packages must be built
  before the API runs** — `pnpm build` is topological.

## Naming / file organization

- Contracts: `packages/shared/src/contracts/<domain>.ts` (one domain per file).
- API routes: `apps/api/src/routes/<domain>.routes.ts`, exporting a factory
  `create<Domain>Routes(deps)`.
- Services / repositories: `apps/api/src/services/<name>-service.ts` and
  `<name>-repository.ts`, each an exported `create<Name>(…)` factory.
- Domain packages: kebab-case files, a barrel `index.ts`, test-only helpers in a
  `testing.ts` exported as a subpath (`@infra/auth/testing`).
- Factory functions are `createXxx`; port interfaces are nouns (`OtpStore`,
  `TodoRepository`, `Logger`).

## Build / typecheck

- Build is **tsup**, typecheck is **`tsc --noEmit`** (via `pnpm typecheck`).
  **Never run `tsc -b`** — it emits into the source tree. Details and the
  `@infra/shared` extensionless-import caveat live in
  [`build-and-typecheck.md`](build-and-typecheck.md).
