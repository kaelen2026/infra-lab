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
Redis key shapes live in `OTP_KEYS` (`otp:code|attempt|cooldown|lock|daily|ip`). Better Auth verifies social
identities and owns compatible core tables; `SessionService` is the sole authority for product sessions.

**Runtime guardrails.** Core env parsing (`packages/env/src/core.ts`) is part of the auth boundary, not
just configuration plumbing. In production the API refuses to boot when `OTP_DEBUG_RETURN_CODE` is enabled,
`COOKIE_SECURE` is false, `TRUSTED_PROXY_COUNT` is zero, or `BETTER_AUTH_SECRET` is unset/reused from
`OTP_SECRET`. The same env bucket owns `MAX_REQUEST_BODY_BYTES`, `SLOW_REQUEST_MS`, and the coarse
Redis-backed rate-limit knobs (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_SECONDS`). `server.ts` mounts
observability first, then security headers, body limit, CORS, probes, and only then rate limiting and
application routes.

**Sessions differ by platform** (see `apps/api/src/services/session-service.ts` + `auth.routes.ts`):
- `web` → HttpOnly cookie `infra.session` (an HS256 JWT).
- native → response body carries `accessToken` (15-min HS256 JWT) + opaque `refreshToken`
  (30-day, stored **hashed** in the `refresh_token` table, **rotated** on each `/auth/refresh` — the old
  token is revoked via `revoked_at`/`replaced_by`).
- `requireUser(headers)` verifies the application JWT from the Bearer header or the `infra.session` cookie —
  so **both Cookie and Bearer resolve through one guard**. Product routes never fall back to Better Auth
  sessions and `/api/auth/*` is not mounted.

**Routes** (`apps/api/src/routes/auth.routes.ts`): `/auth/otp/request`, `/auth/otp/verify`,
`/auth/refresh`, `/auth/logout`, `/auth/me`, profile editing (`PATCH`+`PUT /auth/profile` for the
display name / avatar clearing, `POST /auth/avatar` multipart upload — the latter persists the image
through the same `ImageStore` the timeline uses and returns the refreshed user), account-dashboard reads
(`/auth/devices`, `/auth/login-events`), push-token registration (`POST /auth/devices/push-token`),
the QR endpoints (below), and the CLI device-flow endpoints (below). Error codes map to HTTP status via
`ERROR_STATUS` (cooldown/limits → 429, LOCKED → 423, invalid/expired/unauthorized → 401). A new phone
that verifies successfully auto-creates `user` + `profile` in one transaction. The `Platform` enum is
`["web", "ios", "android", "harmony", "cli", "weapp"]` — `cli` (terminal) and `weapp` (WeChat
mini-program, `apps/miniprogram`) both ride the native Bearer channel.

**Google sign-in** — a second login entry alongside phone-OTP, keyed by a Google
`account` (Better Auth OAuth), for `web/h5` (redirect) and `ios/android/harmony/cli` (native ID
token). `miniprogram` (`weapp`) is intentionally excluded. Google users have no phone (`user.phone`
nullable, so `AuthUser.phone` is `string | null` — a cross-client contract change). Sessions
are still minted by our own `SessionService` (not Better Auth's session), so Google sessions are
indistinguishable downstream from OTP ones. **Status:** both transports have shipped —
the **native ID-token flow** (`POST /auth/social/:provider/token` → `auth.api.signInSocial`
verify + find-or-create → our `SessionService`) and the **web redirect flow**
(`GET /auth/social/:provider/start` → Google → Better Auth's `/api/auth/callback/google`,
where a `hooks.after` bridge in `createAuth` — `bridgeOAuthCallbackSession` — swaps Better
Auth's session cookie for our `infra.session` so logout stays authoritative). Contract in
`packages/shared/src/contracts/social.ts`, routes in `apps/api/src/routes/social.routes.ts`,
bridge in `packages/auth/src/better-auth.ts`. **Account linking** (design §2.3) has shipped:
a logged-in user adds the other credential (phone↔Google) onto one `user` —
`GET /auth/identities`, `POST /auth/link/phone`, native `POST /auth/link/social/:provider/token`,
web `GET /auth/link/social/:provider/start` (reuses the callback bridge, which no-ops on a link),
`POST /auth/unlink`. Conflicts are rejected not auto-merged (`SOCIAL_ALREADY_LINKED` /
`PHONE_ALREADY_LINKED`), and a `user` must keep ≥1 credential (`LAST_CREDENTIAL`). Note the phone
is `user.phone`, **not** a Better Auth `account` row, so our own conservation rule counts it — BA's
`unlinkAccount` guard can't. Routes in `apps/api/src/routes/account-link.routes.ts` (`AccountLinkService`
adapter over BA's account API + internal adapter); web/h5 surface it in the account page's
"登录方式" card. Full design + phased rollout:
[`docs/plans/google-login.md`](../../docs/plans/google-login.md).

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
because the unguessable id is the capability, backing the h5 share landing. The shared contract also defines
`timelineShareLandingPath(id)` (`/t/:id`) and `timelineAppLink(id)` (`infralab://timeline/<id>`). h5 renders
the share landing, and iOS funnels both universal share taps and APNS `link` payloads through
`DeepLinkRouter`. `TIMELINE_POST_NOT_FOUND` → 404.

**Admin console** (`apps/api/src/routes/admin.routes.ts` + `services/admin-repository.ts`) is a web-only
surface. It still uses the same `requireUser(headers)` guard, then checks the persisted `user.role` column
(`USER_ROLES` in `@infra/shared` must stay in sync with `userRoleEnum` in `@infra/db`). Admin endpoints are:
`GET /admin/access`, `GET /admin/stats`, and `GET /admin/users`. User list responses return
`phoneMasked` only; raw phone numbers never cross this API boundary for the admin table. Native clients do
not implement `AdminClient`, so admin changes are not automatically cross-client contract changes.

**Legal documents** (`packages/shared/src/contracts/legal.ts` + `@infra/design` `LEGAL_DOCS`) are h5/web
hosted. The shared contract owns stable paths (`/legal/privacy`, `/legal/terms`) and `legalUrl(base, kind)`
for native clients. The prose lives in `packages/design/src/legal.ts`; web renders it directly and h5 hosts
the mobile page that native clients open. Do not emit legal prose into native generated files unless the
product explicitly needs offline legal rendering.

**Push (APNS)** (`apps/api/src/routes/notification.routes.ts` + `services/apns-client.ts`). Native devices
register their token via `POST /auth/devices/push-token` (stored on `device`). `POST /notifications/test` is
a **dev-only self-push** to exercise the full path (token lookup → APNS send → dead-token cleanup: an
`unregistered` response clears the token) with no real business trigger yet. `server.ts` mounts it **only**
when APNS is configured (`apnsConfigFromEnv` returns non-null) **and** `OTP_DEBUG_RETURN_CODE` is on — never in prod.

**Contracts are the source of truth** (`packages/shared/src/contracts/*`): Zod request schemas, DTOs,
error codes, limit constants, route paths, the `Platform` enum, URL builders, and client interfaces.
The JS reference implementation lives in **`@infra/sdk`** (`packages/sdk/src/client.ts`):
`createAuthClient(opts)` / `createWebAuthClient(baseUrl)`; `createQrLoginClient` /
`createWebQrLoginClient`; `createTodoClient`; `createTimelineClient`; and the web-only
`createAdminClient`. Non-2xx responses throw a typed `HttpAuthError`
(`code`/`status`/`retryAfter`/`remainingAttempts`). `@infra/sdk` re-exports `@infra/shared`, so TS clients
import contracts + client from one place. The `apps/cli` client composes `createAuthClient` /
`createTodoClient` with `platform: "cli"` and a file-backed `TokenStore`.

Native clients mirror only the surfaces they implement in their own language: iOS mirrors auth/todo/timeline
plus QR approval/deep links/APNS; Android mirrors auth/todo/timeline plus QR approval; Harmony currently mirrors
auth/todo and intentionally uses PUT for todo/profile updates because NetworkKit has no PATCH. Any shared
contract change must be coordinated with the relevant native mirrors in the same PR.

**Design / copy generation.** `@infra/design` owns brand tokens, auth/error copy, and legal prose. `pnpm
gen:design` emits web/h5 CSS tokens, iOS generated Swift, Android generated Kotlin/XML, and Harmony generated
color/copy files. CI runs the generator after build and fails if generated outputs drift, so never hand-edit
generated files (`*.generated.*`, `tokens.generated.css`, Android XML colors, Harmony color/copy output).

**Schema** (`packages/db/schema/`): Drizzle/Postgres, re-exported through the `schema/index.ts` barrel
(the drizzle client and drizzle-kit both resolve tables + relations through it). `auth.ts`: Better Auth core
tables (`user/session/account/verification`) use Better Auth's default column names — keep them that way or
the adapter breaks — plus product tables `profile`, `device` (platform enum + push token), `refresh_token`,
`login_event`, and the persisted `user.role` admin gate. `todo.ts`: the `todo` table (FK → `user`,
`onDelete: cascade`, indexed by `user_id`). `timeline.ts`: the `timeline_post` table (FK → `user`, cascade;
`images` as `jsonb`; a `(user_id, created_at desc, id desc)` index serving the keyset list query,
`created_at` at millisecond precision so the cursor never skips rows).
