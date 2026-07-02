---
name: android-build
description: >-
  Build the apps/android APK for a chosen environment (dev/staging/prod) and build type
  (debug/release), then report the output APK path. Use when the user asks to build the
  Android app / an APK, or mentions a specific env×buildType (e.g. "build prod release apk",
  "打个 staging debug 包", "android dev apk"). Handles the Gradle flavor×buildType matrix,
  locates the artifact, and optionally installs it on a connected device.
---

# android-build

Build an Android APK for the phone-number + OTP client (`apps/android`), selecting the API
environment via a Gradle **product flavor** (`dev` / `staging` / `prod`) crossed with a
**build type** (`debug` / `release`).

## Inputs

Parse the user's request into two axes (ask only if ambiguous):

- **env** → `dev` (default) · `staging` · `prod` — picks `API_BASE_URL` + applicationId suffix.
- **buildType** → `debug` (default) · `release`.

Env → `API_BASE_URL` (defined in `apps/android/app/build.gradle.kts` product flavors):

| env     | API_BASE_URL                       | applicationId            |
| ------- | ---------------------------------- | ------------------------ |
| dev     | `http://10.0.2.2:3001` (emulator→host localhost) | `ai.deeplang.infra.dev`     |
| staging | `https://staging-api.example.com`  | `ai.deeplang.infra.staging` |
| prod    | `https://api.example.com`          | `ai.deeplang.infra`         |

> The staging/prod URLs are placeholders — confirm they point at the real API before a
> distributable build.

## Build steps

Run everything from `apps/android`.

1. **Preconditions.** JDK 17 and the Android SDK must be available (`ANDROID_HOME` set, or
   `sdk.dir` in `apps/android/local.properties`). If `gradle/wrapper/gradle-wrapper.jar` is
   missing, generate the wrapper once: `gradle wrapper`.

2. **Compute the variant.** The Gradle variant is `<env><BuildType>` in camelCase; the task is
   `assemble<Variant>`:
   - `dev` + `debug`   → `assembleDevDebug`
   - `staging` + `debug` → `assembleStagingDebug`
   - `prod` + `release` → `assembleProdRelease`

3. **Build.**
   ```bash
   cd apps/android
   ./gradlew assemble<Variant>
   ```

4. **Locate the APK** (Gradle writes it under a flavor/buildType path):
   ```
   apps/android/app/build/outputs/apk/<env>/<buildType>/app-<env>-<buildType>.apk
   ```
   e.g. `app/build/outputs/apk/prod/release/app-prod-release.apk`. Report the absolute path
   and file size.

5. **Report signing status (release only).** Release builds sign with
   `apps/android/keystore.properties` if present, otherwise fall back to the **debug** key —
   installable locally but NOT for distribution. State which was used (check whether
   `keystore.properties` exists). To sign for real, copy `keystore.properties.example` →
   `keystore.properties` and fill it in.

## Optional: install / run on a device

If the user wants it installed and a device/emulator is connected (`adb devices` shows one):

```bash
adb install -r apps/android/app/build/outputs/apk/<env>/<buildType>/app-<env>-<buildType>.apk
```
Or build + install in one step: `./gradlew install<Variant>` (e.g. `installDevDebug`). For a
`dev` build, start the backend first (`docker compose up -d && pnpm --filter @infra/api dev`)
so `10.0.2.2:3001` resolves to the host API.

## Notes

- This Gradle project is intentionally outside the pnpm workspace — it is not part of
  `pnpm build` / `turbo`. Always build via `./gradlew`.
- `detekt` (local lint gate) is separate: `./gradlew detekt`. It does not block the APK build.
- `dev` uses cleartext HTTP (`10.0.2.2`) and is meant for the `debug` build type; prefer
  `staging`/`prod` (HTTPS) for `release`.
