---
name: ios-testflight
description: Archive apps/ios (InfraAuth) into an .ipa and upload it to App Store Connect / TestFlight. Use when asked to 打包/出包/上传/发布 the iOS app, build an ipa, or push a TestFlight build.
---

# iOS → App Store Connect (TestFlight)

Builds a signed device archive of `apps/ios`, exports an `.ipa`, and uploads it to
App Store Connect — all via `apps/ios/Makefile` targets (`archive` / `ipa` / `upload`).
The committed `project.yml` stays ad-hoc/simulator-only; release signing and
credentials are injected on the `make` command line and **never committed**.

## Prerequisites (verify first; ask the user for anything missing)

1. **Paid Apple Developer Program team.** A free personal team cannot distribute.
   The team id is passed as `TEAM_ID` (don't assume a locally-overridden
   `project.yml` team is the right one — the personal device-dev team may differ
   from the release team).
2. **App record in App Store Connect** for bundle id `ai.deeplang.infra.ios`
   (App Store Connect → Apps → New App). Upload fails without it.
3. **App Store Connect API key with role Admin**, downloaded once from App Store
   Connect → Users and Access → Integrations. An App Manager key is NOT enough:
   cloud signing fails with "Cloud signing permission error" (seen 2026-07).
   The `.p8` must sit at `~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8`
   (override with `ASC_KEY_PATH`). Check with
   `ls ~/.appstoreconnect/private_keys/` — never `cat` the key or echo its contents.
4. Full Xcode (not just Command Line Tools: `xcode-select -p` should point into
   `Xcode.app`) and `xcodegen` (`brew install xcodegen`).
5. An app icon in the asset catalog — App Store Connect rejects icon-less binaries
   (ITMS-90022). If `InfraAuth` has no `AppIcon` yet, stop and tell the user.

## Inputs

| Variable | Meaning |
| --- | --- |
| `TEAM_ID` | Release team id (required for `archive`/`ipa`/`upload`) |
| `ASC_KEY_ID` | App Store Connect API key id (enables cloud signing + upload) |
| `ASC_ISSUER_ID` | Issuer id shown next to the API keys |
| `ASC_KEY_PATH` | `.p8` path if not in `~/.appstoreconnect/private_keys/` |
| `BUILD` | Optional `CURRENT_PROJECT_VERSION` override for this archive |

## Steps

```bash
cd apps/ios

# Local .ipa only (lands at build/export/InfraAuth.ipa):
make ipa TEAM_ID=<team> ASC_KEY_ID=<key> ASC_ISSUER_ID=<issuer>

# Archive + upload to App Store Connect (TestFlight):
make upload TEAM_ID=<team> ASC_KEY_ID=<key> ASC_ISSUER_ID=<issuer>
```

- `make upload` uses `ExportOptionsUpload.plist` with
  `manageAppVersionAndBuildNumber: true`, so Xcode bumps the build number to the
  next free one automatically. To pin it instead, pass `BUILD=<n>`.
- The marketing version is `MARKETING_VERSION` in `project.yml`; bump it there
  (source of truth — the `.xcodeproj` is generated) for a new release train.
- Success looks like `EXPORT SUCCEEDED` plus an upload log ending without errors;
  the build then appears in App Store Connect → TestFlight after processing
  (a few minutes; Apple emails if processing rejects it).
- The signed archive itself is `build/InfraAuth.xcarchive` (gitignored, as is the
  whole `build/`).

## Troubleshooting

- **"Cannot create a iOS App Store provisioning profile" / personal team** —
  `TEAM_ID` is a free team; a paid Program membership is required.
- **"Cloud signing permission error" (+ "No profiles for …" as fallout)** — the
  API key's role is too low for cloud-managed distribution certs; recreate the
  key with role **Admin**.
- **"No Accounts / No profiles for ai.deeplang.infra.ios"** alone — missing
  `ASC_KEY_ID`/`ASC_ISSUER_ID`, so `-allowProvisioningUpdates` had no API key to
  do cloud signing with.
- **ITMS-90474 (invalid bundle, orientations)** — iPhone+iPad apps must declare
  all four orientations for iPad multitasking; fixed via
  `UISupportedInterfaceOrientations~ipad` in `project.yml`.
- **Release-only compile errors (e.g. missing `Preview*` symbols)** — code that
  exists only under `#if DEBUG` referenced from an unguarded `#Preview`; guard
  the preview too. Simulator Debug builds don't catch this.
- **ITMS-90189 (redundant binary)** — that build number already exists; rely on
  `make upload`'s auto-bump or pass a higher `BUILD=<n>`.
- **ITMS-90022 (missing icon)** — add an `AppIcon` (1024pt marketing icon
  included) to the asset catalog first.
- **"PLA Update available"** — someone must accept the latest agreement at
  developer.apple.com / App Store Connect (Account Holder only).

## Secrets

Follow `.claude/rules/ios.md`: never print the `.p8` contents, tokens, or put
credentials in files under version control. `TEAM_ID`/key ids on the command line
are fine; the private key itself must never appear in output or commits.
