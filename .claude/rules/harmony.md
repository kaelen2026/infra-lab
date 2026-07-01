# Harmony coding rules (`apps/harmony`, ArkTS / HarmonyOS NEXT)

Read before touching `apps/harmony`. The Harmony client mirrors the shared
`AuthClient` semantics (login == register); only the transport (`@kit.NetworkKit`
http) and secure storage (HUKS-encrypted Preferences) differ. Quality gate is
**local**: DevEco Studio's Code Linter, or the SDK command-line tools —

```
cd apps/harmony && codelinter -c ./code-linter.json5 -f json .
```

ArkTS needs the proprietary DevEco/hvigor toolchain, so this is **not in CI** (same
reason Harmony builds run only on a local device — see the harmony dev-loop notes).

## ArkTS is a strict subset — respect it

- **No `any`.** ArkTS forbids the TS structural-typing escape hatches; every value
  is nominally typed. Give explicit function return types. CodeLinter enforces both.
- **Every object literal needs a named type.** No anonymous shapes — declare an
  `interface` (see `EmptyBody`/`RefreshRequestBody` in `sdk/AuthClient.ets`) and
  construct against it. Runtime-created objects need their class/interface up front.
- Use `class`/`interface`, not prototype tricks; no dynamic property add/delete.
- Prefer `readonly` fields and `const`; model absence with `| null` or `?`, unwrapped
  explicitly — no non-null assertions.

## Async & errors

- Networking is `Promise`-based over `@kit.NetworkKit` http; `await` every promise —
  no floating promises (CodeLinter: `no-floating-promises`). Always close the
  `http.HttpRequest` in a `finally`.
- Catch `BusinessError` narrowly and map non-2xx to the shared `HttpAuthError`
  (stable `AuthErrorCode` + retry/lockout hints). Don't swallow errors in the
  token/refresh path.

## Architecture

- Depend on the `TokenStore` interface, not `HuksTokenStore`, so tests can inject an
  in-memory fake.
- `common/contracts.ets` is the ArkTS mirror of `@infra/shared` auth contracts —
  keep field names byte-compatible with the other clients. Changing them is a
  cross-client contract change (see `.claude/docs/architecture.md`).
- Keep transport/storage/UI separated: pages stay declarative; the SDK layer owns
  http and HUKS.

## Secrets

- **No `console.*`.** It lands in hilog and can leak an OTP or token — CodeLinter
  bans it. Use structured logging without secret payloads.
- Tokens live only in HUKS-encrypted Preferences (AES-256-GCM ciphertext) via
  `HuksTokenStore`; never in plain Preferences, a log, or a page's state. Logout
  must clear them. `ohos.permission.INTERNET` is the only network permission.

## Design tokens

- `entry/src/main/resources/base/element/color.json` and `sdk/copy.generated.ets`
  are emitted from `@infra/design` (`pnpm gen:design`). **Never hand-edit them** —
  change the source and regenerate; CI fails on drift. `copy.generated.ets` is
  excluded from CodeLinter for that reason.
