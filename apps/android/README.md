# Android client (Kotlin + Jetpack Compose)

Native Android client for the phone-number + OTP auth flow. Implements the shared `AuthClient`
contract over **Bearer tokens** (the native session model): `accessToken` is sent on every request,
and a `401` transparently rotates the `refreshToken` and retries.

## Stack

| Concern        | Choice |
|----------------|--------|
| UI             | Jetpack Compose + Material 3 (`AuthScreen` → phone → code → done) |
| State          | `AuthViewModel` + `StateFlow<AuthUiState>` (the Kotlin analogue of the web `useOtpLogin` hook) |
| Networking     | Retrofit + OkHttp + `kotlinx.serialization` |
| Auto-refresh   | OkHttp `Authenticator` (`TokenAuthenticator`) rotates on 401, retries once |
| Token storage  | `EncryptedSharedPreferences` (AES-256, key in the Android Keystore) |
| DI             | `ServiceLocator` (tiny manual container, no framework) |
| minSdk / target| 26 / 36 · Kotlin 2.1 · AGP 8.9 |

## Contract parity

`data/contracts/Contracts.kt` mirrors `packages/shared/src/contracts/auth.ts` (DTOs, error codes,
limits, route paths, platform enum). **Keep the two in lock-step** — it is the source of truth shared
by the API and all four clients (web / ios / android / harmony).

## Build & run

The Gradle wrapper JAR is not committed; generate it (or just open the project in Android Studio,
which does this on sync):

```bash
cd apps/android
gradle wrapper        # one-time: writes gradle/wrapper/gradle-wrapper.jar + gradlew

./gradlew testDebugUnitTest   # hermetic JVM unit tests (input/parse/message logic)
./gradlew assembleDebug       # build the debug APK
./gradlew installDebug        # install on a running emulator/device
./gradlew detekt              # static analysis + ktlint (local gate; --auto-correct to fix)
```

`detekt` is a **local** quality gate (not in CI). Overrides live in
[`config/detekt/detekt.yml`](config/detekt/detekt.yml); coding conventions are in
`.claude/rules/android.md`.

### Pointing at the API

- **Debug** builds default to `http://10.0.2.2:3001` — the emulator's route to the host machine's
  `localhost`, where `pnpm --filter @infra/api dev` serves the API. Cleartext is allowed for debug only.
- **Release** builds use HTTPS (`API_BASE_URL` in `app/build.gradle.kts`) — set it to your deployed API.

Run the backend first (from the repo root):

```bash
docker compose up -d
pnpm --filter @infra/api dev
```

> This Gradle project is intentionally outside the pnpm workspace; it has its own build and is not
> part of `pnpm build`/`turbo`.
