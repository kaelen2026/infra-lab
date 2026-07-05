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
