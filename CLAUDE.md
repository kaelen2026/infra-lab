# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repo.

pnpm-workspace monorepo implementing **phone-number + OTP** auth (login == register) with
**Better Auth** as the identity core, serving five clients: `web / ios / android / harmony / cli`
(plus `h5`, a mobile browser client that reuses web's cookie transport). On top of auth it also
ships **profile editing** (display name + avatar), **todo**, a **timeline** (posts + image upload +
public share link + native deep link), **QR cross-device login**, **CLI browser-assisted login**
(device flow), a **web admin console**, **legal agreement pages**, and **iOS APNS push**.
Postgres holds long-term data; Redis holds all short-term OTP/rate-limit/QR-ticket/device-code state.

## Commands

```bash
pnpm install
docker compose up -d                 # Postgres 16 + Redis 7 (healthchecked)
cp .env.example .env                 # DATABASE_URL, REDIS_URL, OTP_SECRET, BETTER_AUTH_SECRET
pnpm --filter @infra/db migrate      # apply versioned migrations (creates all tables incl. Better Auth's)

# schema change flow: edit packages/db/schema/* → `pnpm --filter @infra/db generate` (emits
# packages/db/migrations/NNNN_*.sql — commit it) → `pnpm --filter @infra/db migrate` to apply.
# `push` remains for throwaway local experiments only; real changes always go through a migration.

pnpm build        # tsup packages/apps + next build for web + vite build for h5
pnpm typecheck    # turbo typecheck (`tsc --noEmit`, plus next typegen for web)
pnpm test         # vitest run (hermetic — no live Redis/PG needed)
pnpm lint         # biome check .   (pnpm lint:fix to autofix+format)
pnpm gen:design   # regenerate cross-client design tokens / auth copy

pnpm dev                             # API (:3001) + Web (:3000) together (turbo; excludes bot & cli)
pnpm dev:api                         # just the API on :3001 (tsx watch)
pnpm dev:web                         # just the Web on :3000
pnpm dev:h5                          # just the H5 SPA on :3002
pnpm --filter @infra/cli dev auth login   # run the terminal client (see apps/cli/README.md)

# free-tier deployment notes + production-like local container validation
cp .env.deploy.example .env.deploy
docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d --build

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
auth, session, OTP, QR/CLI device flow, admin, timeline, legal/share, or contract code.

## Observability (`apps/api/src/observability/`)

The API emits structured JSON logs (one `requestId` per request; `x-request-id` propagated), a cheap
`/health` liveness probe, and a `/ready` readiness probe that checks Postgres + Redis (503 if either is
down). It also mounts security headers, a global request-body ceiling, and a coarse Redis-backed per-IP
rate limiter before application routes. `app.onError` logs stack + `requestId` and returns a generic 500.
`LOG_LEVEL` (default `info`) sets verbosity. **Never log phone numbers, OTP codes, or tokens.**

## Bot

`@infra-lab-bot` in an issue/PR comment, or `gh workflow run infra-lab-bot.yml -f prompt="..."`, runs
claude-code-action as the `infra-lab-bot[bot]` GitHub App. See
[`docs/infra-lab-bot.md`](docs/infra-lab-bot.md); workflow in `.github/workflows/infra-lab-bot.yml`.

`apps/bot` (`@infra/bot`) bridges Feishu/Lark IM into that same workflow: it receives chat over a
long-lived connection, reacts + posts a holding notice, resolves a GitHub App installation token, then
`workflow_dispatch`es the task to `infra-lab-bot.yml` (task as the `prompt` input, plus thread/session
metadata for resume/reply). It's a pure outbound service with no Postgres/Redis — not an auth client.
Run with `pnpm --filter @infra/bot dev`; see
[`apps/bot/README.md`](apps/bot/README.md).

## H5 (`apps/h5`, mobile web)

`@infra/h5` is a **Vite + React 19 + Tailwind v4** SPA — a mobile-first browser client that mirrors
`apps/web` (login == register, account, todos) reshaped for a phone, and also hosts timeline share landing
pages (`/t/:id`) plus legal pages (`/legal/privacy`, `/legal/terms`) referenced by native clients. It is
**not** a new platform: as a browser it reuses `@infra/sdk`'s `createWebAuthClient`/`createWebTodoClient`
(`platform: "web"`, cookie transport, `credentials: "include"`) — no contract change, no client-side token.
Colors come from `src/tokens.generated.css` (emitted by `pnpm gen:design`, in the CI no-drift gate) and
copy/legal prose from `@infra/design` — same source as every other client. It resolves `@infra/*` to
source via Vite + tsconfig aliases (like web). Run `pnpm --filter @infra/h5 dev` (:3002); deployment in
[`apps/h5/docs/deployment.md`](apps/h5/docs/deployment.md).

## CLI (`apps/cli`, terminal client)

`@infra/cli` (bin `infra-lab`) is a **terminal client**, not a new platform: as a cookie-less client it
reuses `@infra/sdk`'s Bearer transport (`platform: "cli"`, the same native channel as iOS/Android/Harmony),
swapping Keychain/Keystore/HUKS for a `0600` JSON credential file. `auth login` does interactive OTP;
`auth login --web` uses a **browser-assisted device flow** (gh-style, RFC 8628): the API mints a secret
`deviceCode` + human `userCode` (`POST /auth/cli/device`), the browser approves it from an existing web
session (`POST /auth/cli/device/approve`, cookie auth, SameSite=Lax), and the CLI polls
(`POST /auth/cli/device/token`) to receive its **own** tokens once — no token ever passes through the
browser; `deviceCode` is stored HMAC-hashed like OTP codes. Ports & adapters throughout (config /
token-store / client / commands injected), so tests are hermetic. Run
`pnpm --filter @infra/cli dev auth login`; design in [`docs/plans/cli-plan.md`](docs/plans/cli-plan.md),
usage in [`apps/cli/README.md`](apps/cli/README.md).

## Web / Admin / Legal

`apps/web` is the desktop browser reference UI: OTP login, QR login, CLI activation (`/auth/cli`),
account/profile/dashboard, todos, timeline, legal agreement pages, and a web-only admin console. Admin
contracts live in `@infra/shared`, but native clients do not implement them; access is gated by persisted
`user.role === "admin"` and user-list phone numbers are masked at the API boundary.

Legal document routes are shared through `packages/shared/src/contracts/legal.ts`; the prose itself lives
in `@infra/design` (`LEGAL_DOCS`). Web renders it directly, h5 hosts the mobile/legal pages, and native
clients open the h5 URL built by `legalUrl()`.

## Language best-practice rules (read before touching that language)

Per-language coding conventions **and** project layering. Each is a deep reference,
not always-on — read the relevant one before editing that code.

**TypeScript** (`packages/*` + `apps/{api,web,h5,bot}`):
[`.claude/rules/typescript.md`](.claude/rules/typescript.md) — strict-TS + ports &
adapters + contracts-as-source-of-truth. Gate is **CI** (`lint · typecheck · build ·
test`).

**Native clients** — per-platform conventions + a **local** lint/format gate (none
run in CI; they are local by design):

- iOS (Swift/SwiftUI, `apps/ios`): [`.claude/rules/ios.md`](.claude/rules/ios.md) — SwiftLint, `make lint`.
- Android (Kotlin/Compose, `apps/android`): [`.claude/rules/android.md`](.claude/rules/android.md) — detekt, `./gradlew detekt`.
- Harmony (ArkTS, `apps/harmony`): [`.claude/rules/harmony.md`](.claude/rules/harmony.md) — DevEco CodeLinter, `codelinter`.

## Repo-local Skills

Codex/Claude repo-local skills live under `.claude/skills/` and are versioned with the repo:

- `android-build` — build Android APK variants and report artifacts.
- `api-architecture` — API/auth/session/contracts architecture refresher.
- `ios-simulator-qa` — simulator-driven iOS UI QA.
- `ios-testflight` — archive and upload iOS builds to TestFlight.

Do not use a separate untracked `.agents/` copy for these; `AGENTS.md` intentionally points back here so
there is one maintained instruction source.

## Rules (always apply)

@.claude/rules/build-and-typecheck.md
@.claude/rules/conventions.md
@.claude/rules/workflow.md
