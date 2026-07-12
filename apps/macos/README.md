# @infra macOS app (SwiftUI)

The macOS client for the phone-number + OTP auth flow (login == register), the
desktop-native peer of `apps/ios`. SwiftUI + URLSession + Keychain. It mirrors the
shared `AuthClient` semantics exactly; only the platform layer differs from iOS:

- **AppKit lifecycle** (`@NSApplicationDelegateAdaptor` / `NSApplicationDelegate`)
  instead of `UIApplicationDelegate`.
- **`NSImage`** instead of `UIImage` for avatar / timeline image handling
  (bridged behind a `PlatformImage` typealias).
- **AVFoundation + Vision** QR scanner instead of VisionKit's `DataScannerViewController`
  (which is iOS-only).
- **`ProcessInfo` / host**-based `DeviceMetadata` instead of `UIDevice`.
- Reports `platform: .macos` (added to `PLATFORMS` in `@infra/shared`), so devices
  show up truthfully in the admin console rather than masquerading as iOS.

After login it shows **todos** and **timeline** with the **account** surface
(profile editing, session, devices, login history, appearance, QR login) — the
same feature set as iOS. It handles APNS push (token report + tap-to-open) and
`infralab://timeline/<id>` deep links from the h5 share landing.

## Stack

- **SwiftUI** app lifecycle, macOS 14+, no third-party runtime dependencies except
  the optional GoogleSignIn SDK (hidden when unconfigured).
- **URLSession** transport; **Keychain** token storage.
- Native session model: `Authorization: Bearer <accessToken>` (15-min JWT) +
  opaque refresh token (30-day, rotated on `/auth/refresh`) — identical to iOS.
- The Xcode project is **generated** from [`project.yml`](project.yml) by
  [XcodeGen](https://github.com/yonsm/XcodeGen) — `InfraLab.xcodeproj` is gitignored.

## Layout

Mirrors `apps/ios/InfraLab/` file-for-file; the platform deltas above live in
`InfraLabApp.swift`, `Auth/AppConfig.swift`, `Auth/GIDGoogleSignInProvider.swift`,
`Push/*`, `Qr/QrScannerView.swift`, and the image files under `Timeline/` and
`Account/`. `Generated/` holds the design tokens + copy emitted by `@infra/design`
(`pnpm gen:design`, `emitMacos`) — never hand-edit.

## Develop

```bash
brew install xcodegen          # one-time
cd apps/macos

make project                   # generate InfraLab.xcodeproj
make build                     # build for the host Mac
make test                      # run the hermetic unit tests
open InfraLab.xcodeproj        # or work in Xcode

brew install swiftlint         # one-time (for the lint gate)
make lint                      # SwiftLint --strict; run before pushing
make format                    # auto-fix what SwiftLint can
```

Lint + build are a **local** gate (macOS builds need a macOS runner, so they are
not in CI, same as iOS). Config is [`.swiftlint.yml`](.swiftlint.yml); coding
conventions are shared with iOS in `.claude/rules/ios.md`.

Point the app at a running API (`pnpm --filter @infra/api dev`, port 3001): the
base URL defaults to `http://localhost:3001` and can be overridden with an
`API_BASE_URL` build setting (`make build API_URL=http://<host>:3001`). With
`OTP_DEBUG_RETURN_CODE=true` on the API, the code step shows the returned code.

The contracts here track `packages/shared/src/contracts/{auth,todo,timeline}.ts` —
update both sides together when a contract changes.

## Release (Developer ID)

```bash
make app TEAM_ID=<team>   # build/export/InfraLab.app (Developer ID, direct distribution)
```

Needs a **paid** Apple Developer Program team and a Developer ID Application
certificate. Release signing is passed on the command line — the committed
`project.yml` stays ad-hoc/local-only.
