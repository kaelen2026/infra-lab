# Single session authority design

## Goal

Make the application-owned `SessionService` the only authority for application
sessions. It must be the sole component that issues, verifies, refreshes, and
revokes credentials used by product routes.

The change removes the parallel Better Auth session path without changing any
published product endpoint, request body, response body, or client storage
format.

## Scope

Included:

- Cookie and Bearer authentication on all product routes.
- Session issuance after OTP verification and CLI device-flow approval.
- Access-token verification, refresh-token rotation, and logout.
- Removal of the Better Auth HTTP handler and its use during product-route
  authentication.
- Tests and architecture documentation that describe the single authority.

Excluded:

- Changing JWT claims, credential lifetimes, cookie attributes, or refresh-token
  storage.
- Changing the Web, H5, CLI, mini-program, iOS, Android, or Harmony API contract.
- Replacing Better Auth's Drizzle schema or identity-model integration.
- Adding OAuth, SSO, or server-side session revocation for access tokens.

## Authority boundary

`SessionService` owns the following application credential lifecycle:

| Credential | Issued by | Verified by | Revoked or cleared by |
|---|---|---|---|
| Web `infra.session` JWT cookie | `SessionService.issueWebSession*` | `SessionService.requireUser` | `SessionService.revoke` clears the browser cookie |
| Native / CLI / mini-program access token | `SessionService.issueTokens` and `refresh` | `SessionService.requireUser` | Expires naturally; refresh revocation prevents renewal |
| Refresh token | `SessionService.issueTokens` and `refresh` | `SessionService.refresh` | `SessionService.revoke` and refresh rotation |

Better Auth remains an identity-model dependency. It supplies the configured
Drizzle adapter and its tables, but it does not issue, verify, or revoke
credentials accepted by product routes. The API no longer mounts Better Auth's
`/api/auth/*` handler.

## Request flow

```text
OTP verification / CLI device-flow approval
  -> SessionService issues cookie or token pair
  -> client sends Cookie or Authorization: Bearer
  -> SessionService.requireUser verifies the application JWT
  -> SessionService loads the current user record
  -> protected route executes
```

`requireUser` checks a valid Bearer token first when present, otherwise the
`infra.session` cookie. It returns `null` for an absent, malformed, expired, or
invalid application token. Route behavior remains unchanged: `null` maps to the
existing `401 UNAUTHORIZED` responses.

The application must not fall back to `auth.api.getSession`. A Better Auth
cookie or bearer token is therefore not sufficient to access a product route.

## Implementation shape

1. Remove `Auth` and `auth` from `SessionServiceConfig`; remove the Better Auth
   lookup in `requireUser`.
2. Remove `auth` from `AppDeps`, `server.ts`, and `worker.ts` unless it remains
   needed only to construct another dependency. Keep `createAuth` only where its
   identity-model integration is still required by a retained component.
3. Remove the `/api/auth/*` route mount from `createApp`.
4. Keep the existing route-facing `SessionService` interface unchanged so auth,
   QR, Todo, Timeline, admin, and notification routes do not need contract
   changes.
5. Update the architecture guide to state the authority boundary explicitly.

The refactor stays inside API composition and session implementation. It does
not introduce a new abstraction or move product-route ports.

## Error handling and compatibility

- Existing application credentials continue to validate because the signing
  secret, token format, names, and lifetimes are unchanged.
- Existing refresh tokens continue to rotate because the database lookup and
  hash format are unchanged.
- Requests authenticated only by a Better Auth credential now return the
  existing `401 UNAUTHORIZED` result. This endpoint family is intentionally
  removed because product clients never use it.
- A failed user lookup after valid JWT verification returns unauthenticated,
  matching the current behavior.

## Tests

Update or add hermetic tests to prove:

1. A valid application cookie authenticates a protected route.
2. A valid application Bearer access token authenticates a protected route.
3. Missing, malformed, expired, and invalid application tokens are rejected.
4. Refresh rotation and logout retain their present semantics.
5. `SessionService.requireUser` does not invoke Better Auth.
6. `/api/auth/*` is not mounted, while all product route tests remain valid.
7. The Node and Workers composition types compile after their dependency lists
   are reduced.

The normal `pnpm test`, `pnpm typecheck`, and focused API tests provide the
acceptance gate. No live Redis, Postgres, or Better Auth service is required.

## Rollout and rollback

This is a code-only compatibility-preserving deployment for product clients:
no migration or client release is required. Deploy the API normally. If an
unknown integration depends on `/api/auth/*`, rollback the API deployment; no
data conversion is involved.
