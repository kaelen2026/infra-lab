# @infra iOS app (SwiftUI)

The iOS client for the phone-number + OTP auth flow (login == register), the
native counterpart to `apps/web`. SwiftUI + URLSession + Keychain. After login
it shows two tabs — **todos** (per-user list with create/toggle/delete) and
**timeline** (text + image posts, cursor-paginated feed) — with the **account**
surface (profile editing, session, devices, login history, appearance, QR login)
behind the avatar button in the top-right corner. It also handles APNS push
(token report + tap-to-open) and `infralab://timeline/<id>` deep links from the
h5 share landing.

## Stack

- **SwiftUI** app lifecycle, iOS 17+, no third-party runtime dependencies.
- **URLSession** transport; **Keychain** token storage (`kSecAttrAccessibleAfterFirstUnlock`).
- Native session model: `Authorization: Bearer <accessToken>` (15-min JWT) +
  opaque refresh token (30-day, rotated on `/auth/refresh`). See the repo
  architecture doc for how this differs from the web cookie session.
- The Xcode project is **generated** from [`project.yml`](project.yml) by
  [XcodeGen](https://github.com/yonsm/XcodeGen) — `InfraLab.xcodeproj` is gitignored.

## Layout

```
InfraLab/
  InfraLabApp.swift          @main — wires Keychain store + one shared transport → view models,
                             hosts the deep-link sheet (onOpenURL → SharedPostView)
  Auth/
    AuthContracts.swift      Swift mirror of @infra/shared auth contracts (DTOs, codes, limits)
    AuthError.swift          AuthClientError + error→copy mapping (mirrors web messages.ts)
    TokenStore.swift         TokenStore protocol + Keychain / in-memory impls
    AuthClient.swift         URLSession client (otp/refresh/me/logout + profile/devices/login-events)
    AuthorizedTransport.swift shared Bearer transport: attaches the token, refreshes+retries once on 401
    SessionRefresher.swift   single-flight refresh-token rotation shared by all clients
    AppConfig.swift          API / share-landing base URLs + device metadata
    AuthViewModel.swift      headless flow state machine (mirrors web useOtpLogin)
  Account/
    AccountViewModel.swift   devices + login history, display-name/avatar edits
    AccountSheet.swift       account modal behind the avatar button (profile / session /
                             appearance / QR login / devices / login events / logout)
    EditProfileView.swift    display-name + avatar (PhotosPicker) editing
  Todo/
    TodoContracts.swift      Swift mirror of @infra/shared todo contracts
    TodoClient.swift         URLSession todo client (list/create/update/toggle/remove)
    TodoViewModel.swift      list + create/toggle/delete state (mirrors web useTodos)
    TodosView.swift          composer + list with completion toggle and delete
  Timeline/
    TimelineContracts.swift  Swift mirror of @infra/shared timeline contracts
    TimelineClient.swift     list (cursor) / upload image / create / remove / getShared (public)
    TimelineViewModel.swift  infinite-scroll feed + two-step publish (upload images → post)
    TimelineView.swift       feed cards; ComposeTimelineView.swift (PhotosPicker + camera)
    SharedPostView.swift     deep-linked public post sheet (+ SharedPostViewModel)
    ImageCache.swift / ImageViewer.swift   cached async images, full-screen pager
  Qr/
    QrScannerView.swift      VisionKit scanner for the web login QR
    QrApproveViewModel.swift scan → explicit confirm → approve ticket
  Push/
    PushRegistration.swift   permission + APNS token lifecycle + reporter to the API
    AppDelegate.swift        token callbacks + foreground banner + tap → deep-link router
  DeepLink/
    DeepLink.swift           parses infralab://timeline/<id> urls / push `link` payloads
    DeepLinkRouter.swift     single funnel from onOpenURL + notification taps to UI state
  Health/                    /health probe + global server-status banner
  Appearance/                system/light/dark preference, persisted
  Generated/                 design tokens + copy from @infra/design — never hand-edit
  Views/                     RootView, phone/code steps, authenticated tabs + shared theme
InfraLabTests/               hermetic tests: HTTP clients (URLProtocol-stubbed) and
                             view models (scriptable fake clients)
```

## Develop

```bash
brew install xcodegen          # one-time
cd apps/ios

make project                   # generate InfraLab.xcodeproj
make build                     # build for the iPhone simulator
make test                      # run the hermetic unit tests
open InfraLab.xcodeproj       # or work in Xcode

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
`.../todo.ts` / `.../timeline.ts` — update both sides together when a contract
changes.

## Release (TestFlight)

```bash
make ipa    TEAM_ID=<team> ASC_KEY_ID=<key> ASC_ISSUER_ID=<issuer>  # build/export/InfraLab.ipa
make upload TEAM_ID=<team> ASC_KEY_ID=<key> ASC_ISSUER_ID=<issuer>  # archive + upload to App Store Connect
```

Needs a **paid** Apple Developer Program team and an App Store Connect API key
(`~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8`). Release signing is passed
on the command line — the committed `project.yml` stays ad-hoc/simulator-only.
Push note: the source entitlements stay `aps-environment=development`; the
app-store-connect export re-signs to `production` automatically — match the
server's `APNS_PRODUCTION` to the install (dev build → sandbox, TestFlight → prod).
Prerequisites and troubleshooting: [`.claude/skills/ios-testflight/SKILL.md`](../../.claude/skills/ios-testflight/SKILL.md).
