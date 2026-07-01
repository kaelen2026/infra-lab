# `@infra/env`

Single source of truth for the repo's environment variables: **schema, defaults and
validation** live here, so a missing or malformed value fails at boot with a named
error instead of surfacing on some later request path.

This centralizes the *definition* of env, not the *files*. Values still live in the
usual places (`.env` for local dev, the platform / GitHub secrets in CI/prod) — this
package is what parses and type-checks them.

## Buckets

Env is split by concern; import only the bucket a process needs, so a subsystem can't
read a secret it has no business seeing.

| Subpath             | Used by                         | Policy                                                              |
| ------------------- | ------------------------------- | ------------------------------------------------------------------- |
| `@infra/env/core`   | `apps/api`, db tooling, scripts | **fail-fast** — Postgres / Redis / Better-Auth secrets are required |
| `@infra/env/feishu` | `apps/feishu`                   | **graceful-degradation** — every field optional, parsing never throws |

The two policies are deliberate. The API cannot serve without a database, so `core`
throws at boot. The bot intentionally runs in a reduced mode when a credential is
absent (skips the ws client, degrades the LLM responder, refuses group messages), so
`feishu` normalizes into typed optionals + defaults and never throws. Read `feishu`
live at each use (`parseFeishuEnv`) — it is not memoized, because the router reads the
bot open-id per message.

## Usage

```ts
import { loadCoreEnv } from "@infra/env/core";

const env = loadCoreEnv(); // loads repo .env if present, validates, memoizes
createDb(env.DATABASE_URL);
```

`loadCoreEnv()` loads the repo `.env` (via `process.loadEnvFile`, guarded — a no-op
in production where the platform injects real env vars) and validates `process.env`.
`parseCoreEnv(bag)` is the pure, side-effect-free core used by tests.

## Adding a variable

1. Add the field to the schema in `src/core.ts` (with a default if optional).
2. Document it in the repo `.env.example`.
3. Read it via `env.YOUR_VAR` at the call site — never `process.env.YOUR_VAR`.

Never log a parsed value; zod issue messages carry the var name, never the input.
