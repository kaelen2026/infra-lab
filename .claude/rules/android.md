# Android coding rules (`apps/android`, Kotlin / Jetpack Compose)

Read before touching `apps/android`. The Android client mirrors the shared
`AuthClient` semantics (login == register); only the transport (Retrofit/OkHttp)
and secure storage (`androidx.security-crypto` / EncryptedSharedPreferences) differ.
Quality gate is **local**: `cd apps/android && ./gradlew detekt` (config in
`config/detekt/detekt.yml`; `--auto-correct` fixes formatting). Not in CI.

## Language & safety

- **No `!!` (not-null assertion).** It is Kotlin's force-unwrap — a nil crash in an
  auth flow is a user-facing security event. Use `?.`, `?:`, `requireNotNull(x) { … }`
  with a message, or a `let`/`when` on the nullable. detekt enforces this.
- **No `println` / `print`.** They leak to logcat and can spill an OTP or token.
  detekt bans both; diagnostics go through structured logging.
- Don't catch `Exception`/`Throwable` generically and don't swallow — an empty or
  message-less `catch` in the token/refresh path hides real failures. Catch the
  narrowest type and either handle or rethrow with cause. detekt enforces this.
- Prefer immutability: `val` over `var`, data classes for contracts, expression
  bodies for one-liners. No wildcard imports.

## Coroutines

- Networking is `suspend` on Retrofit; collect flows with the lifecycle-aware APIs.
- ViewModels expose state as `StateFlow`/Compose state and launch work in
  `viewModelScope`; never block a thread or use `runBlocking` in app code.
- Switch to `Dispatchers.IO` only for genuinely blocking work (e.g. Keystore);
  Retrofit `suspend` calls already move off the main thread.

## Architecture & Compose

- Depend on the `AuthClient` interface, not the Retrofit implementation; inject it
  (and the token store) so tests can supply fakes.
- Composables are side-effect-free and driven by state hoisted into the ViewModel —
  no networking or token logic inside a `@Composable`. Use `collectAsStateWithLifecycle`.
- Contracts (`@Serializable` data classes) must stay byte-compatible with
  `@infra/shared` — same JSON field names. Changing them is a cross-client contract
  change (see `.claude/docs/architecture.md`).

## Secrets

- Tokens live only in EncryptedSharedPreferences via the token store — never in
  plain `SharedPreferences`, a log, or an analytics event. Logout must clear them.
- `API_BASE_URL` is a `buildConfigField` on the `env` product flavor (`dev`/`staging`/`prod`
  in `app/build.gradle.kts`), not per build type; don't hardcode URLs elsewhere. Build a
  variant with `assemble<Env><BuildType>` (or the `/android-build` skill). The OkHttp logging
  interceptor must never log at `BODY` level in release.

## Design tokens

- `DesignTokens.kt`, `AuthCopyGenerated.kt`, and `res/values*/colors.generated.xml`
  are emitted from `@infra/design` (`pnpm gen:design`). **Never hand-edit them** —
  change the source and regenerate; CI fails on drift.
