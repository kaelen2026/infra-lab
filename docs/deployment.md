# Deployment

## Free-Tier Baseline

The practical free/near-free baseline is split by responsibility:

| Layer | Recommended free service | Why |
| --- | --- | --- |
| Web (`apps/web`) | [Vercel Hobby](https://vercel.com/docs/plans/hobby) | Free for personal/small projects; native Next.js support. |
| H5 (`apps/h5`) | [Cloudflare Pages Free](https://pages.cloudflare.com/) | Static SPA hosting with free builds and CDN. |
| API (`apps/api`) | [Render Free web service](https://render.com/docs/free) or [Koyeb Free Instance](https://www.koyeb.com/docs/reference/instances) | Both can run the existing API Dockerfile. Render sleeps after 15 minutes; Koyeb free has 512 MB RAM / 0.1 vCPU and scales to zero after idle. |
| Postgres | [Neon Free](https://neon.com/pricing) | Serverless Postgres with 100 CU-hours/month per project and scale-to-zero for intermittent load. |
| Redis | [Upstash Redis Free](https://upstash.com/pricing/redis) | Serverless Redis compatible with this app's short-lived OTP/rate-limit/QR/device-code state. |
| Object storage | [Cloudflare R2 Free](https://developers.cloudflare.com/r2/pricing/) | Needed before uploads are durable on free API instances; current code still uses local API disk. |

Hard constraints:

- Browser auth currently depends on `infra.session` with `SameSite=Lax`. Free platform default domains
  (`*.vercel.app`, `*.onrender.com`, `*.pages.dev`) are different sites, so cookie auth will not be
  reliable across them. Use subdomains under one domain you control, for example:
  `app.example.com`, `api.example.com`, `h5.example.com`, with `COOKIE_DOMAIN=.example.com`.
- API free instances have ephemeral local filesystems. Timeline/avatar uploads stored through the current
  local `ImageStore` can disappear on redeploy, restart, or scale-to-zero. Treat uploads as demo-only until
  an R2/S3-backed `ImageStore` is added.
- Free API instances sleep. OTP login, QR polling, and CLI device flow can see cold-start latency. This is
  acceptable for demos, not a production SLO.

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

See `.env.free.example` for the full variable list. Platform-specific build settings:

| Target | Build command | Output / Docker |
| --- | --- | --- |
| Vercel Web | `corepack pnpm --filter @infra/web build` | Root `apps/web`; set `NEXT_PUBLIC_API_URL`. |
| Cloudflare H5 | `corepack pnpm --filter @infra/h5 build` | Output `apps/h5/dist`; set `VITE_API_URL`. |
| Render/Koyeb API | Dockerfile `apps/api/Dockerfile` | Set all API env vars from `.env.free.example`. |

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
| `h5` | `apps/h5/Dockerfile` | `H5_PORT` → `80` | Static SPA served by nginx. `VITE_API_URL` is compiled into the browser bundle. |
| `bot` | `apps/bot/Dockerfile` | none | Optional outbound Feishu/GitHub bridge. Start with `--profile bot`. |

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

### Health

- API: `/health` is liveness; `/ready` checks Postgres and Redis.
- Web: container health checks the Next server root path.
- H5: nginx serves static assets; external health can probe `/`.
