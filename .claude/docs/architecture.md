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
`/auth/refresh`, `/auth/logout`, `/auth/me`, plus account-dashboard reads (`/auth/devices`,
`/auth/login-events`), push-token registration (`POST /auth/devices/push-token`), the QR endpoints (below),
and the CLI device-flow endpoints (below). Error codes map to HTTP status via `ERROR_STATUS`
(cooldown/limits → 429, LOCKED → 423, invalid/expired/unauthorized → 401). A new phone that verifies
successfully auto-creates `user` + `profile` in one transaction. The `Platform` enum is
`["web", "ios", "android", "harmony", "cli"]` — `cli` rides the native Bearer channel.

**CLI browser-assisted login — device flow** (`apps/api/src/routes/auth.routes.ts`, gh-style / RFC 8628).
The terminal client (`apps/cli`) can't read a browser cookie, so instead: (1) the CLI (unauthenticated)
`POST /auth/cli/device`s for a secret `deviceCode` + short human `userCode` + the page to open; (2) the
browser, carrying the user's HttpOnly session cookie (SameSite=Lax, same CSRF posture as `/auth/logout`),
`POST /auth/cli/device/approve`s to bind the pending request to the current user — no token returns to the
browser; (3) the CLI polls `POST /auth/cli/device/token` with its `deviceCode` (pending states are HTTP 200
with a status, not an error) and, once approved, receives its **own** Bearer + refresh token exactly once
(the code is consumed). `deviceCode` is stored HMAC-hashed in Redis like OTP codes. `CLI_VERIFICATION_PATH`
(`/auth/cli`) is the web page the CLI opens; route paths live in `AUTH_ROUTES.cliDevice*`.

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
`fakeRequireUser`, so they're hermetic like the auth route tests. (`update` is registered on **both**
`PATCH` and `PUT` — HarmonyOS's NetworkKit has no PATCH, so the harmony client updates via PUT; same handler.)

**Timeline** (`apps/api/src/routes/timeline.routes.ts`) is the second business feature, same isolation shape
as todo one layer richer. It injects a `TimelinePostRepository` (per-user, scoped by `userId`) plus an
`ImageStore` port (local-disk adapter persists uploaded bytes and serves them back at `GET /uploads/:name`).
`POST /timeline/images` validates content type (`TIMELINE_IMAGE_CONTENT_TYPES`) and size
(`TIMELINE_IMAGE_MAX_BYTES`) — mapping to `415 UNSUPPORTED_IMAGE_TYPE` / `413 IMAGE_TOO_LARGE` — and returns
the URL to embed; `POST /timeline` stores `{ text, images[] }`. `GET /timeline` is **keyset-paginated** on
`(createdAt, id)` (millisecond-precision `created_at`, matching index `timeline_post_user_created_id_idx`).
`GET /timeline/share/:id` is the one **unauthenticated** read — `getById` deliberately skips the user scope
because the unguessable id is the capability, backing the h5 share landing. `TIMELINE_POST_NOT_FOUND` → 404.

**Push (APNS)** (`apps/api/src/routes/notification.routes.ts` + `services/apns-client.ts`). Native devices
register their token via `POST /auth/devices/push-token` (stored on `device`). `POST /notifications/test` is
a **dev-only self-push** to exercise the full path (token lookup → APNS send → dead-token cleanup: an
`unregistered` response clears the token) with no real business trigger yet. `server.ts` mounts it **only**
when APNS is configured (`apnsConfigFromEnv` returns non-null) **and** `OTP_DEBUG_RETURN_CODE` is on — never in prod.

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
Timeline follows the same pattern (`contracts/timeline.ts` → `createTimelineClient` / `createWebTimelineClient`),
and QR login ships `createWebQrLoginClient` (browser) with the native side calling `approve` directly. The
`apps/cli` client composes `createAuthClient`/`createTodoClient` with `platform: "cli"` and a file-backed
`TokenStore`.

**Schema** (`packages/db/schema/`): Drizzle/Postgres, re-exported through the `schema/index.ts` barrel
(the drizzle client and drizzle-kit both resolve tables + relations through it). `auth.ts`: Better Auth core
tables (`user/session/account/verification`) use Better Auth's default column names — keep them that way or
the adapter breaks — plus product tables `profile`, `device` (platform enum + push token), `refresh_token`, `login_event`.
`todo.ts`: the `todo` table (FK → `user`, `onDelete: cascade`, indexed by `user_id`). `timeline.ts`: the
`timeline_post` table (FK → `user`, cascade; `images` as `jsonb`; a `(user_id, created_at desc, id desc)`
index serving the keyset list query, `created_at` at millisecond precision so the cursor never skips rows).
