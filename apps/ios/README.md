# @infra iOS app (SwiftUI)

The iOS client for the phone-number + OTP auth flow (login == register), the
native counterpart to `apps/web`. SwiftUI + URLSession + Keychain. After login it
serves the same two business screens web does — **account** (profile, session,
devices, login history) and **todos** (per-user list with create/toggle/delete) —
behind a tab bar.

## Stack

- **SwiftUI** app lifecycle, iOS 17+, no third-party runtime dependencies.
- **URLSession** transport; **Keychain** token storage (`kSecAttrAccessibleAfterFirstUnlock`).
- Native session model: `Authorization: Bearer <accessToken>` (15-min JWT) +
  opaque refresh token (30-day, rotated on `/auth/refresh`). See the repo
  architecture doc for how this differs from the web cookie session.
- The Xcode project is **generated** from [`project.yml`](project.yml) by
  [XcodeGen](https://github.com/yonsm/XcodeGen) — `InfraAuth.xcodeproj` is gitignored.

## Layout

```
InfraAuth/
  InfraAuthApp.swift         @main — wires Keychain store + HTTP clients → view models
  Auth/
    AuthContracts.swift      Swift mirror of @infra/shared auth contracts (DTOs, codes, limits)
    AuthError.swift          AuthClientError + error→copy mapping (mirrors web messages.ts)
    TokenStore.swift         TokenStore protocol + Keychain / in-memory impls
    AuthClient.swift         URLSession client (otp/refresh/me/logout + devices/login-events)
    AuthorizedTransport.swift shared Bearer transport: attaches the token, refreshes+retries once on 401
    SessionRefresher.swift   single-flight refresh-token rotation shared by all clients
    AppConfig.swift          API base URL + device metadata
    AuthViewModel.swift      headless flow state machine (mirrors web useOtpLogin)
  Account/
    AccountViewModel.swift   loads devices + login history (mirrors web useAccountData)
    AccountView.swift        account dashboard: profile / session / devices / login events
  Todo/
    TodoContracts.swift      Swift mirror of @infra/shared todo contracts
    TodoClient.swift         URLSession todo client (list/create/update/toggle/remove)
    TodoViewModel.swift      list + create/toggle/delete state (mirrors web useTodos)
    TodosView.swift          composer + list with completion toggle and delete
  Views/                     RootView, phone/code steps, authenticated tabs + shared theme
InfraAuthTests/              hermetic AuthClient / TodoClient tests (URLProtocol-stubbed)
```

## Develop

```bash
brew install xcodegen          # one-time
cd apps/ios

make project                   # generate InfraAuth.xcodeproj
make build                     # build for the iPhone simulator
make test                      # run the hermetic unit tests
open InfraAuth.xcodeproj       # or work in Xcode

brew install swiftlint         # one-time (for the lint gate)
make lint                      # SwiftLint --strict; run before pushing
make format                    # auto-fix what SwiftLint can
```

Lint is a **local** gate (iOS needs a macOS runner, so it isn't in CI). Config is
[`.swiftlint.yml`](.swiftlint.yml); coding conventions are in `.claude/rules/ios.md`.

Point the app at a running API (`pnpm --filter @infra/api dev`, port 3001):
the base URL defaults to `http://localhost:3001` and can be overridden with an
`API_BASE_URL` Info.plist entry. With `OTP_DEBUG_RETURN_CODE=true` on the API,
the code step shows the returned code for convenience.

The contracts here track `packages/shared/src/contracts/auth.ts` and
`.../todo.ts` — update both together when a contract changes.

## Release (TestFlight)

```bash
make ipa    TEAM_ID=<team> ASC_KEY_ID=<key> ASC_ISSUER_ID=<issuer>  # build/export/InfraAuth.ipa
make upload TEAM_ID=<team> ASC_KEY_ID=<key> ASC_ISSUER_ID=<issuer>  # archive + upload to App Store Connect
```

Needs a **paid** Apple Developer Program team and an App Store Connect API key
(`~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8`). Release signing is passed
on the command line — the committed `project.yml` stays ad-hoc/simulator-only.
Prerequisites and troubleshooting: [`.claude/skills/ios-testflight/SKILL.md`](../../.claude/skills/ios-testflight/SKILL.md).
