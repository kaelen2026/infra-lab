# iOS coding rules (`apps/ios`, Swift / SwiftUI)

Read before touching `apps/ios`. The iOS client mirrors the shared `AuthClient`
semantics (login == register); only the transport (URLSession) and secure storage
(Keychain) differ. Quality gate is **local**: `cd apps/ios && make lint` (SwiftLint,
`.swiftlint.yml`). Not in CI — iOS needs a macOS runner.

## Language & safety

- **No force-unwrap, no force-try, no implicitly-unwrapped optionals** (`!`, `try!`,
  `String!`). A crash-on-nil in an auth flow is a user-facing security event. Model
  absence with `?` and unwrap via `guard let` / `if let`. SwiftLint enforces this.
- **No `print(...)`.** It can leak an OTP or token to the device console. SwiftLint
  bans it. Debug-only code echoes live behind `OTP_DEBUG_RETURN_CODE` on the server.
- Prefer `guard` for early exit over nested `if`. Keep the happy path un-indented.
- Value types (`struct`) for models/contracts; `final class` for reference types
  (SDK clients, view models) — mark `final` unless subclassing is intended.

## Concurrency

- Networking is `async`/`await` on `URLSession`; **never** block with semaphores or
  completion-handler bridges. Wrap transport failures as `AuthClientError.transport`.
- View models are `@MainActor final class … ObservableObject`. All published state
  mutates on the main actor; only the awaited SDK calls hop off it. Do not read/write
  `@Published` state from a background context.
- Store long-running work in a `Task` handle (e.g. the cooldown timer) and cancel it
  on teardown / re-entry; never leak a spinning `Task`.

## Architecture (ports & adapters)

- Views stay declarative: no networking, no token logic in a `View`. All flow state,
  SDK calls and input normalization live in `AuthViewModel`.
- Depend on the `AuthClient` **protocol**, not `HTTPAuthClient`. Inject it (and
  `TokenStore`, `URLSession`) via `init` so tests can supply fakes (see
  `InfraAuthTests/MockURLProtocol.swift`).
- Contracts in `Auth/AuthContracts.swift` must stay byte-compatible with
  `@infra/shared` — same field names, same casing. Changing them is a cross-client
  contract change (see `.claude/docs/architecture.md`).

## Secrets

- Tokens live only in the Keychain via `TokenStore`; never in `UserDefaults`, a
  plist, a log line, or an analytics event. `logout()` must `store.clear()`.
- Attach `Authorization: <tokenType> <accessToken>` only when a token is present.

## Design tokens

- Colors and copy under `InfraAuth/Generated/` are emitted from `@infra/design`
  (`pnpm gen:design`). **Never hand-edit them** — change the source and regenerate.
  They are excluded from SwiftLint for the same reason.
