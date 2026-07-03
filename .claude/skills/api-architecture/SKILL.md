---
name: api-architecture
description: >-
  Architecture + design constraints of the backend API (`apps/api`) — the Hono service
  implementing phone-number + OTP auth (login == register) for web/ios/android/harmony/h5,
  with Better Auth as identity core, Redis-backed OTP, and per-user todo/timeline/push
  features. Read this BEFORE adding or changing anything under `apps/api` (a route,
  service/repository, session/token logic, middleware, or a contract it depends on), or
  when reasoning about how auth/session/OTP/isolation invariants must hold. Complements
  `.claude/docs/architecture.md` (the cross-file map) with the concrete rules that must
  not be broken.
---

# api-architecture

The API (`apps/api`, a **Hono** app on Node, `:3001`) is the single backend for all clients.
It owns phone-OTP auth, session issuance, and the per-user business features (todo, timeline,
push). This skill is the checklist of **how it is shaped** and **which invariants must hold** —
read it before touching API code so a change stays consistent with the rest of the system.

Authoritative sources (read the ones you'll touch):
- `.claude/docs/architecture.md` — the cross-file narrative (ports/adapters, sessions, routes, schema).
- `apps/api/src/server.ts` — the composition root (all wiring + middleware order lives here).
- `packages/shared/src/contracts/{auth,todo}.ts` — contracts (schemas, DTOs, error codes, limits).

## Architecture (ports & adapters)

Every unit is a **factory that takes its collaborators as arguments** — no module reaches for
a global driver. This is what makes the tests hermetic (no live Redis/PG).

- **Routes** are `create<Feature>Routes(deps): Hono` — `auth.routes.ts`, `todo.routes.ts`,
  `timeline.routes.ts`, `notification.routes.ts`. They declare the *ports* they need as TS
  interfaces at the top of the file (e.g. `UserRepository`, `SessionService`,
  `TimelinePostRepository`, `ImageStore`) and depend only on those interfaces.
- **Services/adapters** in `src/services/` implement those ports against the real world
  (Drizzle/Postgres, Better Auth, ioredis, node:crypto, local disk, APNS).
- **The OTP domain** (`packages/auth/src/otp.ts`) defines a minimal `OtpStore` port and imports
  **no Redis driver**; `@infra/redis` implements it (`@infra/redis` → depends on `@infra/auth`,
  not the reverse). Tests inject `FakeRedis` from `@infra/auth/testing`.
- **`server.ts` is the only composition root.** It reads env once, constructs the real adapters,
  and wires them into the route factories. New wiring goes here — don't instantiate a db/redis
  client deeper in the tree.

**Rule:** a new route depends on a *port interface* it declares, never on a concrete service.
Add a `Fake…` implementation for tests (see `apps/api/test/*.routes.test.ts` for the pattern —
inject a `FakeTodoRepository` + a switchable `fakeRequireUser`).

## Auth flow (login == register)

- **Redis OTP service is the sole authority** for code issuance/verification and all limits.
  Constants live in `OTP_LIMITS` (`packages/shared/src/contracts/auth.ts`), not scattered:
  code length **6**, TTL **300s**, resend cooldown **60s**, **10/day per phone**,
  **30/hour per IP**, lock after **5** wrong attempts for **600s**.
- Codes are stored **only as HMAC-SHA256 hashes** (`OTP_SECRET`), compared with a timing-safe
  equal, and **deleted on success** (single-use). Key shapes live in `OTP_KEYS`.
- `/auth/otp/verify` **finds-or-creates**: a brand-new phone auto-creates `user` + `profile`
  in one transaction, then issues a session. There is no separate register endpoint.
- **Better Auth owns the identity model** (Drizzle adapter + `bearer()` plugin) and its own
  `/api/auth/*` endpoints; our OTP layer sits alongside it.

## Sessions differ by platform — one guard resolves both

`session-service.ts` + `tokens.ts`:
- **web / h5** (cookie platforms, `isCookiePlatform`) → HttpOnly cookie `infra.session`
  (`SameSite=Lax`, `Secure` in prod), carrying an HS256 JWT.
- **native** (ios/android/harmony) → response body `tokens`: 15-min HS256 `accessToken` +
  opaque `refreshToken` (30-day). The refresh token is stored **hashed** (`refresh_token` table)
  and **rotated on every `/auth/refresh`** (old row gets `revokedAt` + `replacedBy`).
- **`requireUser(headers)` is the single auth guard**: try Better Auth `getSession` first, then
  fall back to verifying our JWT from the `Authorization: Bearer` header **or** the cookie. So
  **Cookie and Bearer resolve through the same path** — every protected route uses it, and any
  new protected route must too (`requireUser: (h) => sessions.requireUser(h)`).
- `logout` is **sign-out-all**: clears the cookie *and* revokes every outstanding refresh token
  for the user.
- JWTs are a **dependency-free HS256** implementation (`tokens.ts`) — verification is timing-safe
  and checks `exp`. Refresh tokens are `randomBytes(32)`; **only the sha256 hash touches the DB.**

## Routes & the uniform response envelope

Every response is `{ ok: boolean, ... }`. Errors are `{ ok: false, code, ...extra }` with the
HTTP status derived from a per-feature `ERROR_STATUS: Record<ErrorCode, StatusCode>` map — not
hand-written per handler. Auth mapping: cooldown/limits → **429**, `LOCKED` → **423**,
invalid/expired/unauthorized/bad-refresh → **401**, bad input → **400**. Timeline adds
`404 TIMELINE_POST_NOT_FOUND`, `413 IMAGE_TOO_LARGE`, `415 UNSUPPORTED_IMAGE_TYPE`.

Endpoints (all under `/`):
- Auth: `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/refresh`,
  `POST /auth/logout`, `GET /auth/me`, `GET /auth/devices`,
  `POST /auth/devices/push-token`, `GET /auth/login-events`.
- Todo: `/todos*` (per-user).
- Timeline: `GET/POST /timeline`, `POST /timeline/images`, `DELETE /timeline/:id`, and the
  **public** `GET /uploads/:name` image server.
- Notifications: `POST /notifications/test` — **dev-only**, mounted only when APNS is configured
  **and** `OTP_DEBUG_RETURN_CODE` is on.
- Health: `GET /health` (liveness), `GET /ready` (Postgres + Redis, 503 if down).

**Rule:** add a new error to the feature's `ErrorCode` union + `ERROR_STATUS` map + the contract,
then use `fail(c, code, extra)`. Don't invent ad-hoc status codes or response shapes.

## RESTful design (best practices + the deliberate deviations)

Business-resource endpoints follow REST; auth is intentionally RPC. **Follow REST for any new
resource; deviate only with a reason as explicit as the ones below.**

**REST vs RPC — pick by the nature of the operation, not for blanket "consistency".** The real
consistency rule is *same kind of operation → same style*, not *one style everywhere*:
- Maps to CRUD on an **owned, addressable resource** (a persistent noun the client can point a URL
  at) → **REST** (plural-noun collection + item, verb = action). This is why `todos`/`timeline`
  are REST: per-user resource collections with a full create/read/update/delete lifecycle, and REST
  gives idempotent `DELETE`/`PUT` + safe/cacheable `GET` for free — which matters for flaky-network
  retries on the native clients.
- Is a **side-effecting action / multi-step stateful flow** with no client-addressable resource →
  **RPC verb endpoint**. This is why the OTP/session *steps* (`/auth/otp/request`, `/auth/otp/verify`,
  `/auth/refresh`, `/auth/logout`) are RPC: "verify a code" or "rotate a token" isn't CRUD on a noun,
  and forcing it into REST (e.g. `POST /sessions` to log in) is awkward for a request→verify→refresh
  flow. RPC is the standard, pragmatic exception for auth.
- The split is **per-operation, not per-feature**: even inside auth, the *reads* are REST GETs
  (`GET /auth/me`, `GET /auth/devices`, `GET /auth/login-events`) while only the flow steps are RPC.
  Don't RPC-ify a resource for symmetry with auth, and don't CRUD-ify an auth action for symmetry
  with todos.

**What to follow (already the convention — see `todo.routes.ts`, `timeline.routes.ts`):**
- **Resources are plural nouns; the HTTP verb is the action** — never a verb in the path for a
  resource. Collection `/<things>`, item `/<things>/:id`:
  - `GET /todos` list · `POST /todos` create · `PATCH /todos/:id` update · `DELETE /todos/:id`.
- **Verb semantics:** `GET` safe + read-only (no side effects), `POST` create on a collection,
  `PATCH` partial update, `DELETE` remove. Keep them idempotent where HTTP requires it.
- **Status codes carry meaning:** `200` ok, `201` on create (todo/timeline/image creation already
  return 201), `400` bad input, `401` unauthenticated, `404` missing/foreign, `409`-class only if a
  real conflict exists, `413/415` for payload/enctype, `429` rate limit, `423` locked.
- **Nest a sub-resource under its owner** (`POST /timeline/images`, `POST /auth/devices/push-token`)
  rather than inventing a top-level verb endpoint.
- **Validate at the edge** (`schema.safeParse`) and return the uniform error; **never** leak a stack.

**Deliberate deviations — keep them, don't "fix" them (each breaks clients or an invariant if changed):**
1. **Envelope over bare bodies.** Every response is `{ ok, ... }` / `{ ok:false, code }`, not a
   bare resource or an empty `204`. Even `DELETE` returns `200 { ok:true }`. This is a
   cross-client contract (`@infra/sdk` + native mirrors) — a purist switch to `204 No Content`
   would break them.
2. **Auth endpoints are RPC verbs, on purpose.** `/auth/otp/request`, `/auth/otp/verify`,
   `/auth/refresh`, `/auth/logout` are *actions*, not resources — the standard, pragmatic REST
   exception for auth flows. Don't try to CRUD-ify them.
3. **`PUT` is aliased to `PATCH` (partial-update) semantics** for `/todos/:id`, because HarmonyOS
   `NetworkKit` has no `PATCH` method (`todo.routes.ts:98`). Same handler, partial update for
   both — a knowing break from PUT-means-full-replace. Preserve the alias.
4. **`404`, never `403`, for a foreign/missing id** — see *Per-user isolation*; returning 403
   would confirm the row exists.

**Rule:** a new business resource = plural-noun collection + item routes, correct verbs, correct
status codes, the `{ ok, code }` envelope, and `(userId, id)` scoping. If you must deviate, write a
one-line justification comment like the four above, and make sure it doesn't break the contract or
an isolation/security invariant.

## Contracts are the source of truth

Request schemas (Zod), DTOs, error codes, limit constants, route paths, the `Platform` enum, and
the client interfaces all live in `packages/shared/src/contracts/{auth,todo}.ts` — **shared by the
API and every client SDK**. The JS reference client is `@infra/sdk`. Changing a field name,
casing, or error code is a **cross-client contract change** that also affects ios/android/harmony
(their contract mirrors must stay byte-compatible — see `.claude/docs/architecture.md` and the
native rules files). Validate input by `schema.safeParse` at the route edge; never trust the body.

## Per-user isolation (a hard invariant)

Every protected route resolves the user first (`null → 401`) and passes `user.id` into the
repository; the Drizzle adapter **scopes every read/write to `(userId, id)`**. A caller can never
see or mutate another user's rows — a missing *or foreign* id returns a uniform `404`
(`TODO_NOT_FOUND` / `TIMELINE_POST_NOT_FOUND`), never a 403 that would confirm existence.
Repository methods that mutate return a boolean "did a row match" so the route can 404 correctly.

**Rule:** never query by bare `id`. Always `(userId, id)`. Never leak another user's data or the
existence of their rows.

## Security constraints (do not regress)

Global middleware, applied in `server.ts` in this order — keep it:
`observability` → `securityHeaders` → `requestBodyLimit` → `cors`.
- **CORS** reflects only the `TRUSTED_ORIGINS` allowlist with `credentials: true` — **never `"*"`**
  (credentials + wildcard is invalid and unsafe). The allowlist = `BETTER_AUTH_URL` + extras.
- **Body limit** (`MAX_REQUEST_BODY_BYTES`, default 10 MiB) rejects oversized bodies with a
  `413 PAYLOAD_TOO_LARGE` *before* a handler buffers them; it must stay **above** the timeline
  image limit (`TIMELINE_IMAGE_MAX_BYTES` = 8 MiB) + multipart overhead.
- **Security headers** use hono defaults + one deliberate deviation:
  `Cross-Origin-Resource-Policy: cross-origin` so browser clients can `<img>` the upload server.
- **Client IP for rate limiting** (`clientIp`) honours a **trusted-proxy boundary**: XFF is read
  `TRUSTED_PROXY_COUNT` entries from the **right** (proxies *append*). `0` (default) = XFF
  untrusted, fall back to `x-real-ip`. Never trust the leftmost XFF entry.
- **Image upload** is a two-step publish (upload → reference the returned url); `POST /timeline`
  accepts only urls the server actually issued and still holds (`images.has`), blocking forged
  refs. `GET /uploads/:name` is intentionally **unauthenticated** — the unguessable UUID filename
  *is* the capability; files are content-immutable (long cache).
- **`app.onError`** logs stack + `requestId` and returns a **generic 500** (`{ ok:false, code:"INTERNAL" }`)
  — internals never leak to the client.

### The red line: never log secrets/PII
**Never log phone numbers, OTP codes, access/refresh tokens, or request bodies.** The observability
middleware is written to avoid it; keep it that way. The `sms` stub only surfaces the code under
`OTP_DEBUG_RETURN_CODE` (dev). Login-event auditing records phone/ip/platform/reason — **never the code**.

## Config is fail-fast with production guardrails

`@infra/env/core` (`loadCoreEnv`) validates the whole env bucket once at boot and **throws with
named issues** if anything is missing/malformed (zod issue messages carry the var name, never the
value — safe to throw, never echo a value). Production `superRefine` guardrails **refuse to boot**
unless:
- `OTP_DEBUG_RETURN_CODE` is **off** (else it would leak codes),
- `COOKIE_SECURE` is **true** (30-day cookie must not go out without `Secure`),
- `TRUSTED_PROXY_COUNT > 0` (else per-IP quota collapses to one global bucket),
- `BETTER_AUTH_SECRET` is set explicitly and **differs from `OTP_SECRET`** (key separation),
- APNS is **all-or-nothing** (any `APNS_*` set ⇒ full set required, exactly one key source).

**Rule:** new config goes through the `@infra/env/core` schema (fail-fast, typed, never logged) —
don't read `process.env` directly in a route/service.

## Observability

One `requestId` per request (inbound `x-request-id` accepted, length-capped, else generated;
echoed on the response). A request-scoped child logger lives on the Hono context — read it via
`c.get("log")`. Structured JSON only; access log escalates 5xx→error, 4xx→warn, slow→warn
(`SLOW_REQUEST_MS`). `LOG_LEVEL` sets verbosity.

## Build / test / typecheck (repo rules still apply)

- Build is **tsup**, typecheck is `pnpm typecheck`. **Never run `tsc -b`** (pollutes the source tree).
- Tests are **hermetic** (`pnpm test`, vitest) — inject fakes (`FakeRedis`, `Fake…Repository`,
  `fakeRequireUser`); no live Redis/PG. Add a `*.routes.test.ts` for a new route the same way.
- Packages resolve to built `dist` in production, so `pnpm build` is topological — build before
  running the API.
- Any code change follows the workflow rule: **branch + PR, never commit to `main`**; Conventional
  Commits; CI gate (lint/typecheck/build/test) must pass.
