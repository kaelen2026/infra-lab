---
name: deploy
description: Cut a release for one app and ship it via the per-app git tag `{app}_v{version}`. Use when asked to 发布/部署/出个版本/打个 tag/上线/release/cut a release/ship an app for api·web·h5·bot·ios·android·harmony·cli·miniprogram. Covers which files to bump, the tag to push, what it triggers, and how to verify/rollback.
---

# Release & deploy (per-app tag)

`main` is the only long-lived branch and **every change reaches it through a PR**
(branch-protected: PR + CI required, no direct/force push). Merging into `main`
does **not** deploy. **Releasing = pushing a git tag `{app}_v{version}` cut from
`main`.** The app segment selects the target, so each app ships independently.

Full platform/secret matrix lives in [`docs/deployment.md`](../../../docs/deployment.md);
this skill is the operator playbook for actually cutting a release.

## What a tag triggers

| Tag prefix | `deploy.yml` | `release-images.yml` | `release-tag-check.yml` |
| --- | --- | --- | --- |
| `api_v*` · `web_v*` · `h5_v*` | ✅ deploy that app | ✅ build GHCR image | ✅ |
| `bot_v*` | — | ✅ build GHCR image | ✅ |
| `ios_v*` · `android_v*` · `harmony_v*` · `cli_v*` · `miniprogram_v*` | — | — | ✅ |

`release-tag-check.yml` runs on **every** `*_v*` tag and fails the release unless
the tag version matches the app's declared version (and, for native apps, the
platform manifest). It's the only gate for the store-shipped / non-hosted apps.

## The version invariant (bump these BEFORE tagging)

The tag `{app}_v{X}` is rejected unless `X` already equals the app's version
source on `main`. So the version bump is a normal PR that lands first, then you
tag the merged commit.

| App | Files to bump to the new version | Tag |
| --- | --- | --- |
| api · web · h5 · bot · cli · miniprogram | `apps/<app>/package.json` → `version` | `<app>_v<version>` |
| ios | `apps/ios/project.json` (`version` + `buildNumber`) **and** `apps/ios/project.yml` (`MARKETING_VERSION` + `CURRENT_PROJECT_VERSION`) | `ios_v<version>` |
| android | `apps/android/project.json` (`version` + `buildNumber`) **and** `apps/android/app/build.gradle.kts` (`versionName` + `versionCode`) | `android_v<version>` |
| harmony | `apps/harmony/project.json` (`version` + `buildNumber`) **and** `apps/harmony/AppScope/app.json5` (`versionName` + `versionCode`) | `harmony_v<version>` |

Native apps have **no `package.json`** — `project.json` is their version source,
and it must stay equal to the platform manifest that actually ships (that's what
the drift check enforces). `buildNumber` is not in the tag name but must match the
manifest's build (`CURRENT_PROJECT_VERSION` / `versionCode`). Bump both files in
the same PR.

## Cut a release

1. **Bump the version** on a branch and open a PR to `main` (see the table). For a
   native app bump both files; keep `project.json` and the platform manifest equal.
2. **Merge the PR** (CI must be green). The version now lives on `main`.
3. **Tag the merged commit and push:**

   ```bash
   git checkout main && git pull --ff-only
   git tag api_v0.2.0            # <app>_v<version> — must equal the bumped version
   git push origin api_v0.2.0
   ```

4. **Watch the release run:**

   ```bash
   gh run list --workflow=release-tag-check.yml -L 3
   gh run watch <run-id>        # or: gh run list --workflow=deploy.yml -L 3
   ```

   `release-tag-check` should pass first; for hosted apps `deploy.yml` and
   `release-images.yml` run in parallel off the same tag.

### Per-app notes

- **api / web / h5** — the tag deploys to the free-tier target *if* the repo
  Variable `DEPLOY_API` / `DEPLOY_H5` / `DEPLOY_WEB` is `"true"` and its secrets are
  set (`docs/deployment.md`). Otherwise the deploy jobs no-op and only the image
  builds. `deploy-api` runs `db-migrate` (Neon) first.
- **bot** — no hosted deploy; the tag only publishes the GHCR image.
- **ios / android / harmony** — the tag is a version anchor + drift gate; the app
  still ships through its store. After tagging, build/upload with the platform
  skill: `ios-testflight` (iOS), `android-build` (Android APK/AAB), or the local
  HarmonyOS DevEco flow.
- **cli / miniprogram** — the tag is a version anchor; publish through their own
  channel (npm / WeChat devtools) out of band.

## Enabling a hosted deploy target (one-time)

Deploys are opt-in. Under **Settings → Secrets and variables → Actions**:

- set Variable `DEPLOY_API` / `DEPLOY_H5` / `DEPLOY_WEB` = `true`;
- add that target's secrets (Cloudflare / Vercel / Neon) and browser-bundle
  Variables (`NEXT_PUBLIC_API_URL` for web, `VITE_API_URL` for h5).

See the CD table in `docs/deployment.md` for the exact secret/variable set. Until a
target is enabled its deploy job is skipped, so tagging is safe before setup.

## Verify & roll back

- **Verify** the deploy hit prod by checking the app's health/route, or the GHCR
  package (`ghcr.io/<owner>/<repo>/<app>:<version>`).
- **Roll back** by deploying an earlier version: for hosted apps, either
  `workflow_dispatch` `deploy.yml` with the `target` input against an earlier tag's
  ref, or re-tag a prior known-good commit with a new bumped version (never move an
  existing tag). Native/store apps roll back through their store console.

## Gotchas

- **`release-tag-check` failed with `tag version 'X' != … version 'Y'`** — you
  tagged before the version bump landed on `main`, or bumped only one of the two
  native files. Fix the version on `main` (new PR), delete the bad tag
  (`git push origin :api_v0.2.0`), re-tag.
- **iOS version source is `project.yml`, not the `.xcodeproj`** — the xcodeproj is
  generated by XcodeGen and gitignored; the drift check reads `project.yml`.
- **Don't move or reuse a tag.** Tags are immutable release anchors; ship a new
  version instead.
- **A tag is not a substitute for the PR.** The tagged commit must already be on
  `main` (which means it already passed CI as a PR).
