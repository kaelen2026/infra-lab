# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repo.

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

## Architecture

How the OTP/auth/session/contracts pieces span files (ports & adapters, platform sessions, routes,
contracts, schema): read [`.claude/docs/architecture.md`](.claude/docs/architecture.md) before touching
auth, session, OTP, or contract code.

## Rules (always apply)

@.claude/rules/build-and-typecheck.md
@.claude/rules/conventions.md
@.claude/rules/workflow.md
