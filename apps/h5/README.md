# @infra/h5 — mobile web client

A mobile-first browser client for the phone-number + OTP auth flow (login ==
register). It is a **Vite + React 19 + Tailwind CSS v4** SPA that mirrors the
`apps/web` browser-session model, reshaped for a phone: a full-screen login,
then a bottom tab bar over the account and todos surfaces. It also owns the
mobile public routes that should open cleanly in a browser or WebView:
timeline share landing pages (`/t/:id`) and legal documents (`/legal/*`).

## What it reuses

h5 is a browser, so it is **not** a new platform — it authenticates exactly like
`apps/web`:

- **Transport**: `@infra/sdk`'s `createWebAuthClient`, `createWebTodoClient`,
  and `createWebTimelineClient` (`platform: "web"`, `credentials: "include"`).
  The session rides the HttpOnly `infra.session` cookie; **no token is ever
  stored client-side**.
- **Contracts**: request/response shapes, route helpers, legal document kinds,
  and app links come from `@infra/shared` — unchanged.
- **Design**: colors come from `src/tokens.generated.css` and copy from
  `@infra/design`'s `COPY` / `ERROR_MESSAGES`. Both are the single source shared
  1:1 with web / ios / android / harmony. `tokens.generated.css` is emitted by
  `pnpm gen:design` — **never hand-edit it**; CI fails on drift.

## Develop

```bash
pnpm --filter @infra/h5 dev        # Vite dev server on :3002
```

Point it at a non-default API with `VITE_API_URL` (defaults to
`http://localhost:3001`). The API must allow this origin with
`Access-Control-Allow-Credentials` for the cookie session to work cross-origin.

```bash
pnpm --filter @infra/h5 build      # production bundle to dist/
pnpm --filter @infra/h5 typecheck  # tsc --noEmit
```

Lint (`pnpm lint`) and the hermetic test suite (`pnpm test`) run repo-wide and
cover h5 too — no per-app config.

## CD: Cloudflare Pages

Deployed by [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)
(`deploy-h5` job) on push to `main` **when the repo variable `DEPLOY_H5=true`**. The
job builds the static SPA and runs `wrangler pages deploy apps/h5/dist`. Because
`VITE_API_URL` is inlined at build time, it is a **build-time repo variable**, not a
runtime secret.

One-time setup:

1. Create a Cloudflare Pages project; set the repo variable `CF_PAGES_PROJECT` to its
   name.
2. Repo secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Repo variables:
   `VITE_API_URL` (your API origin, e.g. `https://api.<your-domain>`),
   `DEPLOY_H5=true`.
3. **Same-site cookie constraint**: serve h5 on `h5.<your-domain>` alongside the API on
   `api.<your-domain>` (`COOKIE_DOMAIN=.<your-domain>`). A `*.pages.dev` host is a
   different site and breaks the cookie session — attach a custom domain.

Deployment topologies (same-origin nginx proxy vs. cross-origin static host) and the
full cookie discussion live in [`docs/deployment.md`](docs/deployment.md); the
free-tier matrix is in [`../../docs/deployment.md`](../../docs/deployment.md).
