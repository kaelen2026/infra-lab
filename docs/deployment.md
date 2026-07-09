# Deployment

## Free-Tier Baseline

The practical free/near-free baseline is split by responsibility:

| Layer | Recommended free service | Why |
| --- | --- | --- |
| Web (`apps/web`) | [Vercel Hobby](https://vercel.com/docs/plans/hobby) | Free for personal/small projects; native Next.js support. |
| H5 (`apps/h5`) | [Cloudflare Pages Free](https://pages.cloudflare.com/) | Static SPA hosting with free builds and CDN. |
| API (`apps/api`) | [Cloudflare Workers Free](https://developers.cloudflare.com/workers/platform/pricing/) | The API has a Workers entry (`src/worker.ts`) that runs on the free plan with the Neon / Upstash / R2 adapters. Fallback: the same Node Dockerfile on [Render Free](https://render.com/docs/free) or [Koyeb Free](https://www.koyeb.com/docs/reference/instances). |
| Postgres | [Neon Free](https://neon.com/pricing) | Serverless Postgres with 100 CU-hours/month per project and scale-to-zero for intermittent load. On Workers the API talks to it via the `@neondatabase/serverless` driver (`@infra/db/neon`). |
| Redis | [Upstash Redis Free](https://upstash.com/pricing/redis) | Serverless Redis for the short-lived OTP/rate-limit/QR/device-code state. On Workers the API uses the Upstash **REST** client (`@infra/redis/upstash`), not a `redis://` connection. |
| Object storage | [Cloudflare R2 Free](https://developers.cloudflare.com/r2/pricing/) | Backs timeline/avatar uploads on the Workers runtime (R2 `ImageStore`), where there is no local disk. The Node/Docker runtime still uses local disk. |

Hard constraints:

- Browser auth depends on `infra.session` with `SameSite=Lax`. Free platform default domains
  (`*.workers.dev`, `*.vercel.app`, `*.pages.dev`, `*.onrender.com`) are different sites, so cookie auth will
  not be reliable across them. Use subdomains under one domain you control, for example:
  `app.example.com`, `api.example.com`, `h5.example.com`, with `COOKIE_DOMAIN=.example.com` — and attach each
  as a custom domain on its platform.
- On the **Workers** runtime, uploads go to an R2 bucket (durable). On the **Node/Docker** runtime the local
  `ImageStore` writes to the container filesystem, which is ephemeral on free hosts — treat those uploads as
  demo-only, or point that deploy at object storage too.
- Free serverless runtimes cold-start. OTP login, QR polling, and CLI device flow can see first-request
  latency after idle. Acceptable for demos, not a production SLO.
- **Workers-specific**: APNS push is disabled on Workers (its `node:http2` transport is unsupported); use the
  Node runtime if you need push. `crypto.randomInt` and Better Auth session minting over the Neon serverless
  adapter should be confirmed on the first real deploy.

Free-tier environment shape:

```bash
BETTER_AUTH_URL=https://app.example.com
NEXT_PUBLIC_API_URL=https://api.example.com
VITE_API_URL=https://api.example.com
TRUSTED_ORIGINS=https://h5.example.com
COOKIE_DOMAIN=.example.com
COOKIE_SECURE=true
TRUSTED_PROXY_COUNT=1
DATABASE_URL=<Neon pooled Postgres URL, sslmode=require>
REDIS_URL=<Upstash Redis URL, preferably rediss://...>
```

Two database knobs are enforced/consumed by the API at boot:

- **TLS guardrail** — with `NODE_ENV=production` the API refuses to start unless `DATABASE_URL`
  carries `sslmode=require` (or `verify-ca`/`verify-full`, or `ssl=true`). For a database on a
  genuinely private network (like the deploy compose's internal bridge) set
  `DATABASE_ALLOW_PLAINTEXT=true` explicitly instead.
- **Pool sizing** — `DATABASE_POOL_MAX` (default 10) is the postgres-js pool ceiling **per API
  replica**. Size it so `replicas × DATABASE_POOL_MAX ≤` the database's connection limit, leaving
  headroom for migrations/psql: self-hosted `postgres:16-alpine` defaults to `max_connections=100`
  (so e.g. 4 replicas × 10 = 40 is comfortable); on Neon connect through the **pooled** URL
  (PgBouncer) and keep per-replica pools small — the free tier's direct connection limit is much
  lower than 100.

See `.env.free.example` for the full variable list. Platform-specific build settings:

| Target | Build command | Output / Docker |
| --- | --- | --- |
| Vercel Web | `corepack pnpm --filter @infra/web build` | Root `apps/web`; set `NEXT_PUBLIC_API_URL`. |
| Cloudflare H5 | `corepack pnpm --filter @infra/h5 build` | Output `apps/h5/dist`; set `VITE_API_URL`. |
| Cloudflare API | `corepack pnpm --filter "@infra/api..." build` then `wrangler deploy` | Entry `apps/api/src/worker.ts`, config `apps/api/wrangler.toml`; set Worker secrets + R2 binding. |
| Render/Koyeb API (fallback) | Dockerfile `apps/api/Dockerfile` | Set all API env vars from `.env.free.example`. |

## CD pipeline (`.github/workflows/deploy.yml`)

Continuous deployment is a single workflow with one job per target. Every job is
**opt-in and safe-by-default**: it runs only when its repo *variable* is set to `"true"`
(Settings → Secrets and variables → Actions → Variables), so the workflow does nothing
until you enable a target and add its secrets. It triggers on push to `main` and via
`workflow_dispatch`.

| Job | Target | Runs when | Secrets | Variables |
| --- | --- | --- | --- | --- |
| `db-migrate` | Neon (migrations) | `DEPLOY_API=true` | `DATABASE_URL` | — |
| `deploy-api` | Cloudflare Workers | `DEPLOY_API=true` (after `db-migrate`) | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | — |
| `deploy-h5` | Cloudflare Pages | `DEPLOY_H5=true` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | `CF_PAGES_PROJECT`, `VITE_API_URL` |
| `deploy-web` | Vercel | `DEPLOY_WEB=true` | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | — |

The **Worker's own runtime secrets** are not in the workflow — set them once with
`wrangler secret put` (or the dashboard): `DATABASE_URL`, `OTP_SECRET`,
`BETTER_AUTH_SECRET` (≠ `OTP_SECRET`), `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`. Non-secret Worker config lives in `apps/api/wrangler.toml`
`[vars]`. Per-app setup steps: [`apps/api`](../apps/api/README.md),
[`apps/web`](../apps/web/README.md), [`apps/h5`](../apps/h5/README.md).

Migrations run **before** the API rolls out and never on container/worker start —
`db-migrate` gates `deploy-api` so a bad migration blocks the deploy. The migrate step
(`pnpm --filter @infra/db migrate`) takes a Postgres **advisory lock**, so a CI deploy
racing a manual run serialises instead of interleaving DDL; migrations remain
forward-only (no down migrations — rollback is a hand-written SQL exercise).

Native clients (ios / android / harmony) and the cli / bot are **not** in this pipeline:
the mobile apps release through their stores (local, signed builds — see each app's
README), and cli/bot are not browser-facing hosted services.

## Local Container Validation

This repo also has two compose layers:

- `docker-compose.yml`: local infrastructure only (`postgres`, `redis`) for `pnpm dev`.
- `docker-compose.deploy.yml`: production-like service layer (`api`, `web`, `h5`, optional `bot`) plus
  Postgres and Redis for single-host/container validation. This layer is for validating images and wiring;
  it is not the free hosted architecture above.

### Build And Run

```bash
cp .env.deploy.example .env.deploy
# Edit .env.deploy first: set real domains and unique OTP/BETTER_AUTH secrets.

docker compose --env-file .env.deploy -f docker-compose.deploy.yml build

# Bring up stateful dependencies first.
docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d postgres redis

# Apply migrations before API replicas serve traffic. The deploy compose binds Postgres
# to 127.0.0.1:${POSTGRES_PORT:-5432} for this one-off operational path.
DATABASE_URL="postgres://app:change-me@localhost:5432/app" pnpm --filter @infra/db migrate

docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d
```

For a real production database, run migrations from CI/CD or a one-off release job against the target
`DATABASE_URL`; do not run migrations implicitly in every API container start.

### Services

| Service | Image source | Port | Notes |
| --- | --- | --- | --- |
| `postgres` | `postgres:16-alpine` | `127.0.0.1:POSTGRES_PORT` → `5432` | Bound to loopback for migrations and backup/restore operations. |
| `api` | `apps/api/Dockerfile` | `API_PORT` → `3001` | Hono API. Requires Postgres, Redis, production secrets, secure-cookie settings, and trusted proxy count. |
| `web` | `apps/web/Dockerfile` | `WEB_PORT` → `3000` | Next.js standalone runtime. `NEXT_PUBLIC_API_URL` is compiled into the browser bundle. |
| `h5` | `apps/h5/Dockerfile` | `H5_PORT` → `8080` | Static SPA served by **unprivileged** nginx (non-root ⇒ in-container port is 8080). `VITE_API_URL` is compiled into the browser bundle. |
| `bot` | `apps/bot/Dockerfile` | none | Optional outbound Feishu/GitHub bridge. Start with `--profile bot`. |

All four runtime images run as a **non-root user** (`node` for api/web/bot, `nginx` for h5).
The API image pre-creates `/data/uploads` owned by `node`, so the compose `uploads` volume
inherits writable ownership on first mount — mount custom upload paths accordingly.

### Published images (GHCR)

Pushing a version tag (`git tag v0.3.0 && git push origin v0.3.0`) runs
`.github/workflows/release-images.yml`, which builds all four images and pushes them to
`ghcr.io/<owner>/<repo>/{api,web,h5,bot}` tagged `<semver>` + `sha-<commit>`. Deploy hosts can
then `docker compose pull` instead of building on the box. Web/h5 bake their public API origin
at build time from the repo Variables `NEXT_PUBLIC_API_URL` / `VITE_API_URL` — one published
image serves one topology; set both Variables before tagging.

### Required Runtime Choices

- `NODE_ENV=production` makes the API refuse unsafe settings. Keep `OTP_DEBUG_RETURN_CODE=false`,
  `COOKIE_SECURE=true`, `TRUSTED_PROXY_COUNT>0`, and use distinct `OTP_SECRET` / `BETTER_AUTH_SECRET`.
- Browser clients must call the same public API origin that CORS and Better Auth trust:
  `NEXT_PUBLIC_API_URL` for web, `VITE_API_URL` for h5, `BETTER_AUTH_URL` for the primary web origin,
  and `TRUSTED_ORIGINS` for additional browser origins.
- Terminate TLS and set `X-Forwarded-For` / `X-Forwarded-Proto` at your ingress. Set
  `TRUSTED_PROXY_COUNT` to the exact number of trusted proxy hops in front of the API.
- Uploaded timeline/avatar files live in the API container at `/data/uploads`; the compose layer maps
  that path to the `uploads` volume. Replace this with object storage before horizontal API scaling.

### Health & Metrics

- API: `/health` is liveness; `/ready` checks Postgres and Redis, and answers 503 while the
  process drains after a shutdown signal (point the load balancer's readiness probe here).
  The drain force-exits after `SHUTDOWN_TIMEOUT_MS` (default 10s) — keep that under the
  orchestrator's kill grace period.
- API: `/metrics` is a Prometheus text scrape target (request counts by method/route/status,
  a latency histogram, in-flight gauge, process start time). No PII in the series, but treat
  it as internal: scrape from inside the network or firewall it at ingress.
- Web: container health checks the Next server root path.
- H5: nginx serves static assets; external health can probe `/`.
