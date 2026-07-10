# @infra/api — backend service

The single backend for every client (web / h5 / ios / android / harmony / cli): a
**Hono** app implementing phone-OTP auth (login == register), session issuance, and
the per-user todo / timeline / push features. Postgres holds long-lived data; Redis
holds all short-lived OTP / rate-limit / QR / device-code state. Architecture and
invariants: [`.claude/skills/api-architecture`](../../.claude/skills/api-architecture)
and [`.claude/docs/architecture.md`](../../.claude/docs/architecture.md).

## Two runtimes, one app

The request pipeline lives in [`src/app.ts`](src/app.ts) (`createApp(deps)`) and is
runtime-agnostic. Two thin bootstraps build the concrete adapters and hand them in:

| Entry | Runtime | Postgres | Redis | Uploads | Serve |
| --- | --- | --- | --- | --- | --- |
| [`src/server.ts`](src/server.ts) | Node | postgres-js (`@infra/db`) | ioredis (`@infra/redis`) | local disk | `@hono/node-server` |
| [`src/worker.ts`](src/worker.ts) | Cloudflare Workers | Neon serverless (`@infra/db/neon`) | Upstash REST (`@infra/redis/upstash`) | R2 bucket | `export default { fetch }` |

Adapters are additive — the Node path is unchanged, so local dev, the hermetic tests,
`docker-compose.deploy.yml`, and a Render/Koyeb Dockerfile deploy all keep working.

## Develop / verify (Node)

```bash
docker compose up -d                 # local Postgres + Redis
pnpm --filter @infra/api dev         # tsx watch src/server.ts on :3001
pnpm --filter @infra/api typecheck   # tsc --noEmit
pnpm test                            # hermetic vitest (fakes; no live PG/Redis)
```

## CD: Cloudflare Workers (primary)

Deployed by [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)
(`deploy-api` job) on push to `main` **when the repo variable `DEPLOY_API=true`**.
The job runs migrations first (`db-migrate`), builds the workspace, then
`wrangler deploy`. Config is [`wrangler.toml`](wrangler.toml).

> **已上线**:生产实例运行在 **https://api.w3ctech.dev**(Cloudflare Workers 免费层),后端为
> Neon Free(pooled)+ Upstash Free(REST)+ R2 桶 `infra-lab-uploads`。`wrangler.toml` 的
> `[vars]` 与 `[[routes]]` 已填入真实域名。完整线上拓扑见
> [`docs/deployment.md`](../../docs/deployment.md#当前线上部署w3ctechdev)。

One-time setup (nothing below is committed):

1. **Managed data**: create a [Neon](https://neon.com) project and an
   [Upstash Redis](https://upstash.com) database.
2. **R2 bucket**: `wrangler r2 bucket create infra-lab-uploads` (name must match
   `wrangler.toml`).
3. **Worker secrets** — `wrangler secret put <NAME>` (or the dashboard):
   `DATABASE_URL` (Neon pooled URL, `sslmode=require`), `OTP_SECRET`,
   `BETTER_AUTH_SECRET` (≠ `OTP_SECRET`), `UPSTASH_REDIS_REST_URL`,
   `UPSTASH_REDIS_REST_TOKEN`.
4. **Repo secrets** for the workflow: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
   `DATABASE_URL` (the migrate job); set the repo variable `DEPLOY_API=true`.
5. **Custom domain**: declared in `wrangler.toml` as a `[[routes]]` entry with
   `custom_domain = true` (this repo uses `api.w3ctech.dev`); `wrangler deploy` creates
   the hostname and issues its certificate automatically, provided that domain's zone
   lives in the same Cloudflare account. Set the `[vars]` (`BETTER_AUTH_URL`,
   `TRUSTED_ORIGINS`, `COOKIE_DOMAIN`) to your real domains too. A `*.workers.dev` host
   is a *different site* and breaks the `infra.session` cookie shared with web/h5.

Validate the bundle locally without deploying (needs `pnpm build` first so the
`@infra/*` dist exists):

```bash
pnpm build
pnpm --filter @infra/api build:worker:dryrun   # wrangler deploy --dry-run
```

### Workers caveats

- **APNS is disabled on Workers** — its `node:http2` transport is unsupported there,
  and push is opt-in. Use the Node runtime if you need push.
- Requires the `nodejs_compat` flag (`node:crypto` backs OTP HMAC + JWT signing).
- First-deploy runtime check: `crypto.randomInt` (OTP / CLI device flow) works under
  `nodejs_compat` — `POST /auth/otp/request` returns 200 and an immediate resend hits
  `RESEND_COOLDOWN` (429), so code generation and the Upstash write/read path are live.
  Still to confirm with a real login: Better Auth session minting over the Neon
  serverless adapter (the OTP *verify* → session-cookie step, not exercisable while
  `OTP_DEBUG_RETURN_CODE=false`).

## CD fallback: Render / Koyeb (Docker)

The Node runtime still ships as a container ([`Dockerfile`](Dockerfile)); build the
image and run it on any host that takes a Dockerfile, injecting the full env set from
[`.env.free.example`](../../.env.free.example). Migrations run out-of-band, never on
container start. Full matrix and constraints: [`docs/deployment.md`](../../docs/deployment.md).
