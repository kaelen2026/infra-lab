# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

pnpm-workspace monorepo implementing **phone-number + OTP** auth (login == register) with
**Better Auth** as the identity core, serving four clients: `web / ios / android / harmony`.
Postgres holds long-term data; Redis holds all short-term OTP/rate-limit state.

## Commands

```bash
pnpm install
docker compose up -d                 # Postgres 16 + Redis 7 (healthchecked)
cp .env.example .env                 # DATABASE_URL, REDIS_URL, OTP_SECRET, BETTER_AUTH_SECRET
pnpm --filter @infra/db push         # create tables (incl. Better Auth's) via drizzle-kit

pnpm build        # tsup per package (topological), next build for web
pnpm typecheck    # per-package `tsc --noEmit` (pnpm -r typecheck)
pnpm test         # vitest run (hermetic — no live Redis/PG needed)
pnpm lint         # biome check .   (pnpm lint:fix to autofix+format)

pnpm --filter @infra/api dev         # API on :3001 (tsx watch)
pnpm --filter @infra/web dev         # Web on :3000

node scripts/verify-redis.mjs        # live OTP assertions against running Redis (needs build first)
```

Run a single test:
```bash
pnpm vitest run packages/auth/test/otp.test.ts        # one file
pnpm vitest run -t "locks the phone"                  # by test name
```

## Build/typecheck gotchas (important)

- **Build is tsup, not tsc.** `tsconfig.base.json` sets `"noEmit": true` and the root `tsconfig.json`
  is intentionally **not** a `tsc -b` solution (no `references`). **Never run `tsc -b`** — it emits
  `.js`/`.d.ts` files into the source tree and breaks `rootDir`. Type-check only via `pnpm typecheck`.
- **Intra-package relative re-exports in `@infra/shared` must be extensionless** (`./contracts/auth`,
  not `./contracts/auth.js`). The Next.js app resolves `@infra/shared` to source via a tsconfig path
  alias, and Turbopack cannot resolve `.js`→`.ts`. Other packages may use `.js` (Vite/tsc/tsup handle it).
- Tests resolve `@infra/*` to **source** via aliases in `vitest.config.ts`; the API/web tsconfigs use
  matching `paths`. Production code resolves `@infra/*` to built `dist` via each package's `exports`,
  so **packages must be built before the API can run** (`pnpm build` is topological).

## Architecture (the parts that span files)

**Ports & adapters.** The OTP domain (`packages/auth/src/otp.ts`) defines a minimal `OtpStore` port and
imports no Redis driver. `@infra/redis` implements that port (so `@infra/redis` depends on `@infra/auth`,
not the reverse). Tests inject `FakeRedis` (`@infra/auth/testing`, a virtual-clock in-memory store);
the API wires the real ioredis adapter. The same dependency-injection shape drives `createOtpService`,
`createAuthRoutes(deps)`, `createSessionService`, `createUserRepository` — all take their collaborators as
arguments, which is what makes the route/OTP tests hermetic.

**Auth flow.** Our Redis OTP service is the **sole authority** for code issuance/verification and all
limits (TTL 300s, 60s resend cooldown, 10/day per phone, 30/hour per IP, lockout after 5 wrong for 600s).
Codes are stored only as HMAC-SHA256 hashes (`OTP_SECRET`) and deleted immediately on success (single-use).
Redis key shapes live in `OTP_KEYS` (`otp:code|attempt|cooldown|lock|daily|ip`). Better Auth owns the
identity model (Drizzle adapter + `bearer()` plugin) and session resolution.

**Sessions differ by platform** (see `apps/api/src/services/session-service.ts` + `auth.routes.ts`):
- `web` → HttpOnly cookie `infra.session` (an HS256 JWT).
- native → response body carries `accessToken` (15-min HS256 JWT) + opaque `refreshToken`
  (30-day, stored **hashed** in the `refresh_token` table, **rotated** on each `/auth/refresh` — the old
  token is revoked via `revoked_at`/`replaced_by`).
- `requireUser(headers)` tries Better Auth `auth.api.getSession` first, then falls back to verifying our
  JWT from the Bearer header or the cookie — so **both Cookie and Bearer resolve through one guard**.

**Routes** (`apps/api/src/routes/auth.routes.ts`): `/auth/otp/request`, `/auth/otp/verify`,
`/auth/refresh`, `/auth/logout`, `/auth/me`. Error codes map to HTTP status via `ERROR_STATUS`
(cooldown/limits → 429, LOCKED → 423, invalid/expired/unauthorized → 401). A new phone that verifies
successfully auto-creates `user` + `profile` in one transaction.

**Contracts are the source of truth** (`packages/shared/src/contracts/auth.ts`): Zod request schemas,
DTOs, error codes, limit constants, route paths, the `Platform` enum, and the `AuthClient` interface that
every client SDK implements. `createAuthClient` (`packages/shared/src/sdk/client.ts`) is the JS reference
implementation; native SDK drafts are sketched in `docs/plans/phone-otp-auth-plan.md`.

**Schema** (`packages/db/schema/auth.ts`): Drizzle/Postgres. Better Auth core tables
(`user/session/account/verification`) use Better Auth's default column names — keep them that way or the
adapter breaks. Product tables: `profile`, `device` (platform enum), `refresh_token`, `login_event`.

## Conventions

- TypeScript ESM, `moduleResolution: "Bundler"`, `verbatimModuleSyntax` on (use `import type`).
- Biome formats & lints (2-space, double quotes, trailing commas, 100 cols). Pre-commit runs lint-staged;
  commit-msg enforces **Conventional Commits** (commitlint). Keep commit body lines ≤100 chars.
- `OTP_DEBUG_RETURN_CODE=true` returns the code in the request response — **dev only**; never in prod.

## Workflow rules

@.claude/rules/workflow.md
