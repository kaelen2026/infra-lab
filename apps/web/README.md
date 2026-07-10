# @infra/web — desktop web client + admin console

The desktop reference UI for the phone-OTP auth flow (login == register), plus the
**web-only admin console** (`role === "admin"` gate; the API redacts phone numbers at
its boundary). A **Next.js** app that authenticates over the HttpOnly `infra.session`
cookie via `@infra/sdk` — no token is ever stored client-side. Contracts, colors and
copy come from `@infra/shared` / `@infra/design` (`tokens.generated.css` is emitted by
`pnpm gen:design` — never hand-edit it; CI fails on drift).

## Develop / verify

```bash
pnpm --filter @infra/web dev        # next dev on :3000 (API on :3001)
pnpm --filter @infra/web build      # next build (standalone)
pnpm --filter @infra/web typecheck  # next typegen + tsc --noEmit
```

`NEXT_PUBLIC_API_URL` is **compiled into the browser bundle** at build time — it must
point at the public API origin that CORS + Better Auth trust. Lint (`pnpm lint`) and
the hermetic tests (`pnpm test`) run repo-wide.

`NEXT_PUBLIC_GOOGLE_ENABLED` (default off) gates the "使用 Google 登录" button on `/auth`.
There is no public config endpoint, so set it to `true` **only when the API also has
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`** configured — otherwise a click lands on the
API's `SOCIAL_PROVIDER_DISABLED` response. Also build-time (`NEXT_PUBLIC_*`).

## CD: Vercel (free Hobby tier)

Deployed by [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)
(`deploy-web` job) on push to `main` **when the repo variable `DEPLOY_WEB=true`**. The
job runs `vercel pull → build → deploy --prod` with the Vercel CLI.

One-time setup:

1. Create a Vercel project; set its **Root Directory to `apps/web`** so the monorepo
   build resolves the workspace.
2. In the Vercel project's Environment Variables, set `NEXT_PUBLIC_API_URL` to your API
   origin (e.g. `https://api.<your-domain>`).
3. Repo secrets for the workflow: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`;
   set the repo variable `DEPLOY_WEB=true`.

**Same-site cookie constraint**: web, h5 and the API must share one parent domain
(`app.` / `h5.` / `api.<your-domain>`, `COOKIE_DOMAIN=.<your-domain>`). The default
`*.vercel.app` host is a different site from the API and breaks cookie auth — attach a
custom domain. See [`docs/deployment.md`](../../docs/deployment.md).

## CD fallback: Docker

The app also builds a standalone container ([`Dockerfile`](Dockerfile)) used by
`docker-compose.deploy.yml` for single-host validation; `NEXT_PUBLIC_API_URL` is a
build arg there.
