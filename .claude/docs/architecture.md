# Architecture (the parts that span files)

**Ports & adapters.** The OTP domain (`packages/auth/src/otp.ts`) defines a minimal `OtpStore` port and
imports no Redis driver. `@infra/redis` implements that port (so `@infra/redis` depends on `@infra/auth`,
not the reverse). Tests inject `FakeRedis` (`@infra/auth/testing`, a virtual-clock in-memory store);
the API wires the real ioredis adapter. The same dependency-injection shape drives `createOtpService`,
`createAuthRoutes(deps)`, `createSessionService`, `createUserRepository` — all take their collaborators as
arguments, which is what makes the route/OTP tests hermetic.

**Auth flow.** Our Redis OTP service is the **sole authority** for code issuance/verification and all
limits (TTL 300s, 60s resend cooldown, 10/day per phone, 30/hour per IP, lockout after 5 wrong for 600s).
Codes are stored only as HMAC-SHA256 hashes (`OTP_SECRET`) and deleted immediately on success (single-use).
Redis key shapes live in `OTP_KEYS` (`otp:code|attempt|cooldown|lock|daily|ip`). Better Auth owns the
identity model (Drizzle adapter + `bearer()` plugin) and session resolution.

**Sessions differ by platform** (see `apps/api/src/services/session-service.ts` + `auth.routes.ts`):
- `web` → HttpOnly cookie `infra.session` (an HS256 JWT).
- native → response body carries `accessToken` (15-min HS256 JWT) + opaque `refreshToken`
  (30-day, stored **hashed** in the `refresh_token` table, **rotated** on each `/auth/refresh` — the old
  token is revoked via `revoked_at`/`replaced_by`).
- `requireUser(headers)` tries Better Auth `auth.api.getSession` first, then falls back to verifying our
  JWT from the Bearer header or the cookie — so **both Cookie and Bearer resolve through one guard**.

**Routes** (`apps/api/src/routes/auth.routes.ts`): `/auth/otp/request`, `/auth/otp/verify`,
`/auth/refresh`, `/auth/logout`, `/auth/me`. Error codes map to HTTP status via `ERROR_STATUS`
(cooldown/limits → 429, LOCKED → 423, invalid/expired/unauthorized → 401). A new phone that verifies
successfully auto-creates `user` + `profile` in one transaction.

**QR cross-device login** (`apps/api/src/routes/qr.routes.ts`): a logged-in native client approves a
browser sign-in. The browser `POST /auth/qr/create`s a ticket (Redis, `qr:*` namespace, TTL 120s),
renders `ticketId` as a QR while keeping the secret `pollToken`; a native app scans it and
`POST /auth/qr/approve`s (its own Cookie/Bearer binds its user); the browser polls
`GET /auth/qr/status` (proving ownership with `pollToken`) and, once `approved`,
`POST /auth/qr/consume`s to exchange the single-use ticket for the **same HttpOnly session cookie the
OTP web flow issues** (via `SessionService.issueWebSessionForUser`). Errors: `QR_NOT_FOUND` → 404,
`QR_ALREADY_USED` / `QR_NOT_APPROVED` → 409. SDK: `createWebQrLoginClient` (browser) + the `approve`
call on the native side (iOS `HTTPAuthClient.approveQrLogin`).

**Todo (the first business feature on top of auth)** copies the same shape one layer up.
`createTodoRoutes(deps)` (`apps/api/src/routes/todo.routes.ts`) injects a `TodoRepository` port plus a
`requireUser(headers)` — the very same guard `auth.routes.ts` uses, so `/todos*` accept Cookie **or**
Bearer. Every route resolves the user first (null → 401) and passes `user.id` into the repository; the
Drizzle adapter (`services/todo-repository.ts`) scopes every read/write to `(userId, id)`, so a caller can
never see or mutate another user's todos — accessing a missing/foreign id is a uniform `404 TODO_NOT_FOUND`.
`completedAt` is kept in lockstep with the `completed` flag in `update`. The routes are wired at `/` in
`server.ts` alongside the auth routes. Tests inject an in-memory `FakeTodoRepository` + a switchable
`fakeRequireUser`, so they're hermetic like the auth route tests.

**Contracts are the source of truth** (`packages/shared/src/contracts/auth.ts`, `.../todo.ts`): Zod request schemas,
DTOs, error codes, limit constants, route paths, the `Platform` enum, and the `AuthClient` interface that
every client SDK implements. The JS reference implementation lives in **`@infra/sdk`**
(`packages/sdk/src/client.ts`): `createAuthClient(opts)` (web + native, pluggable `TokenStore`) and
`createWebAuthClient(baseUrl)` (cookie transport; what `apps/web` uses). Non-2xx responses throw a typed
`HttpAuthError` (`code`/`status`/`retryAfter`/`remainingAttempts`). `@infra/sdk` re-exports `@infra/shared`,
so clients import contracts + client from one place. Native SDK drafts are sketched in
`docs/plans/phone-otp-auth-plan.md`. Todo mirrors this exactly: `contracts/todo.ts` defines the schemas,
`TodoDTO`, error codes, route paths and the `TodoClient` interface; `@infra/sdk` ships
`createTodoClient(opts)` + `createWebTodoClient(baseUrl)` (reusing the auth transport and `HttpAuthError`).

**Schema** (`packages/db/schema/`): Drizzle/Postgres, re-exported through the `schema/index.ts` barrel
(the drizzle client and drizzle-kit both resolve tables + relations through it). `auth.ts`: Better Auth core
tables (`user/session/account/verification`) use Better Auth's default column names — keep them that way or
the adapter breaks — plus product tables `profile`, `device` (platform enum), `refresh_token`, `login_event`.
`todo.ts`: the `todo` table (FK → `user`, `onDelete: cascade`, indexed by `user_id`).
