# Android client (Kotlin + Jetpack Compose)

Native Android client for the phone-number + OTP auth flow plus the signed-in account, todos,
timeline, and QR-login approval surfaces. It implements the shared native session model over
**Bearer tokens**: `accessToken` is sent on every authenticated request, and a `401`
transparently rotates the `refreshToken` and retries.

## Stack

| Concern        | Choice |
|----------------|--------|
| UI             | Jetpack Compose + Material 3 (`AuthScreen` → account / todos / timeline shell) |
| State          | `ViewModel` + `StateFlow` per surface (`AuthViewModel`, `TodoViewModel`, `TimelineViewModel`, `QrApproveViewModel`) |
| Networking     | Retrofit + OkHttp + `kotlinx.serialization` (`AuthApi`, `TodoApi`, `TimelineApi`) |
| Auto-refresh   | OkHttp `Authenticator` (`TokenAuthenticator`) rotates on 401, retries once |
| Token storage  | `EncryptedSharedPreferences` (AES-256, key in the Android Keystore) |
| DI             | `ServiceLocator` (tiny manual container, no framework) |
| minSdk / target| 26 / 36 · Kotlin 2.1 · AGP 8.9 |

## Contract parity

`data/contracts/Contracts.kt`, `TodoContracts.kt`, and `TimelineContracts.kt` mirror the matching
files in `packages/shared/src/contracts/` (DTOs, error codes, limits, route paths, platform enum).
**Keep them in lock-step** — the TypeScript contracts are the source of truth shared by the API,
web/h5/cli SDK, iOS, Android, and Harmony.

Current Android feature scope:

- Auth: phone OTP login/register, refresh, logout, current session, devices, login history.
- Account: profile display, current session, registered devices, login history, QR approval entry.
- Todos: list, create, toggle, delete.
- Timeline: newest-first feed, image picker/upload, publish, delete, cursor pagination.
- QR login: scan a web QR ticket and approve it with the current native Bearer session.

Admin, browser-assisted CLI activation, and legal-document routes are web/h5 surfaces, not Android
screens.

## Build & run

The Gradle wrapper JAR is not committed; generate it (or just open the project in Android Studio,
which does this on sync):

```bash
cd apps/android
gradle wrapper        # one-time: writes gradle/wrapper/gradle-wrapper.jar + gradlew

./gradlew testDebugUnitTest   # hermetic JVM unit tests (input/parse/message logic)
./gradlew assembleDevDebug    # build the dev debug APK (see variants below)
./gradlew installDevDebug     # install on a running emulator/device
./gradlew detekt              # static analysis + ktlint (local gate; --auto-correct to fix)
```

`detekt` is a **local** quality gate (not in CI). Overrides live in
[`config/detekt/detekt.yml`](config/detekt/detekt.yml); coding conventions are in
`.claude/rules/android.md`.

### Environments & build variants

The API base URL is selected by an `env` **product flavor** — `dev` / `staging` / `prod` — crossed
with the `debug` / `release` build type, giving six variants. Build any with
`assemble<Env><BuildType>` (e.g. `assembleProdRelease`), or use the **`/android-build`** skill which
picks the variant, finds the APK, and can install it.

| env     | `API_BASE_URL`                     | applicationId               | notes |
|---------|------------------------------------|-----------------------------|-------|
| dev     | `http://10.0.2.2:3001`             | `dev.w3ctech.infralab.dev`     | emulator → host `localhost`; cleartext, debug only |
| staging | `https://staging-api.example.com`  | `dev.w3ctech.infralab.staging` | placeholder — set to real staging API |
| prod    | `https://api.example.com`          | `dev.w3ctech.infralab`         | placeholder — set to real production API |

The `applicationId` suffixes let dev/staging/prod be installed side by side. The APK lands at
`app/build/outputs/apk/<env>/<buildType>/app-<env>-<buildType>.apk`.

For a `dev` build, run the backend first (from the repo root):

```bash
docker compose up -d
pnpm --filter @infra/api dev
```

### Release signing

Release builds sign with `keystore.properties` if present (copy `keystore.properties.example` and
fill it in — both it and the `.jks` are gitignored). Without it, release falls back to the **debug**
key: installable locally, but **not** for distribution.

Run the backend first (from the repo root):

```bash
docker compose up -d
pnpm --filter @infra/api dev
```

> This Gradle project is intentionally outside the pnpm workspace; it has its own build and is not
> part of `pnpm build`/`turbo`.
