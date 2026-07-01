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

pnpm dev                             # API (:3001) + Web (:3000) together (turbo, builds deps first)
pnpm dev:api                         # just the API on :3001 (tsx watch)
pnpm dev:web                         # just the Web on :3000

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

## Observability (`apps/api/src/observability/`)

The API emits structured JSON logs (one `requestId` per request; `x-request-id` propagated), a cheap
`/health` liveness probe, and a `/ready` readiness probe that checks Postgres + Redis (503 if either is
down). `app.onError` logs stack + `requestId` and returns a generic 500. `LOG_LEVEL` (default `info`) sets
verbosity. **Never log phone numbers, OTP codes, or tokens.**

## Bot

`@infra-lab-bot` in an issue/PR comment, or `gh workflow run infra-lab-bot.yml -f prompt="..."`, runs
claude-code-action (Opus 4.8) as the `infra-lab-bot[bot]` GitHub App. See
[`docs/infra-lab-bot.md`](docs/infra-lab-bot.md); workflow in `.github/workflows/infra-lab-bot.yml`.

`apps/feishu` (`@infra/feishu`) bridges Feishu/Lark IM into that same workflow: it receives chat over a
long-lived connection, reacts + posts a holding notice, then `workflow_dispatch`es the task to
`infra-lab-bot.yml` (task as the `prompt` input). It's a pure outbound service with no Postgres/Redis —
not an auth client. Run with `pnpm --filter @infra/feishu dev`; see
[`apps/feishu/README.md`](apps/feishu/README.md).

## Native client rules (read before touching that client)

Per-platform coding conventions + the local lint/format gate for each native client.
Read the relevant one before editing that app (they are not always-on — the TS
monorepo doesn't need them). None of these gates run in CI; they are local by design.

- iOS (Swift/SwiftUI, `apps/ios`): [`.claude/rules/ios.md`](.claude/rules/ios.md) — SwiftLint, `make lint`.
- Android (Kotlin/Compose, `apps/android`): [`.claude/rules/android.md`](.claude/rules/android.md) — detekt, `./gradlew detekt`.
- Harmony (ArkTS, `apps/harmony`): [`.claude/rules/harmony.md`](.claude/rules/harmony.md) — DevEco CodeLinter, `codelinter`.

## Rules (always apply)

@.claude/rules/build-and-typecheck.md
@.claude/rules/conventions.md
@.claude/rules/workflow.md
