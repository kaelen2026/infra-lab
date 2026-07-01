# @infra/harmony — HarmonyOS (ArkTS) client

The harmony face of the phone-OTP auth monorepo. Implements the **same `AuthClient`
semantics** as `apps/web` and the other clients, swapping only the transport
(`@ohos.net.http`) and secure storage (HUKS-encrypted Preferences).

Login == register: a new phone that verifies successfully auto-creates its account
server-side; the client treats both identically.

## Layout

```
apps/harmony/
├─ AppScope/app.json5                       app id / version / icon / label
├─ build-profile.json5                      products + module wiring (HarmonyOS NEXT, API 12)
├─ oh-package.json5                          app-level deps (not an npm package)
└─ entry/                                    the entry HAP module
   ├─ build-profile.json5
   ├─ oh-package.json5
   └─ src/main/
      ├─ module.json5                        EntryAbility + ohos.permission.INTERNET
      ├─ resources/base/{element,profile,media}
      └─ ets/
         ├─ entryability/EntryAbility.ets    loads pages/AuthPage
         ├─ common/
         │  ├─ contracts.ets                 ArkTS mirror of @infra/shared auth contracts
         │  └─ config.ets                    API base URL + DeviceInfo builder
         ├─ sdk/
         │  ├─ AuthClient.ets                AuthClient over @ohos.net.http + HttpAuthError
         │  ├─ HuksTokenStore.ets            AES-256-GCM via HUKS, ciphertext in Preferences
         │  └─ messages.ets                  error code → user copy (mirrors web)
         └─ pages/AuthPage.ets               ArkUI: phone → code → done
```

## How it maps to the contract

`common/contracts.ets` is a **hand-mirror** of `packages/shared/src/contracts/auth.ts`
(HarmonyOS can't import the TS package). Field names are the JSON wire format — keep
them byte-for-byte identical to the server DTOs. If the shared contract changes, update
this file in the same PR.

| Concern        | Web                              | Harmony                                            |
| -------------- | -------------------------------- | -------------------------------------------------- |
| Transport      | `fetch`, `credentials: include`  | `@ohos.net.http`, `Authorization: Bearer <token>`  |
| Session        | HttpOnly cookie `infra.session`  | accessToken (15 min) + rotating refreshToken (30 d) |
| Token storage  | none (cookie)                    | AES-256-GCM in HUKS, ciphertext base64 in Preferences |
| Error handling | `HttpAuthError` + `describeAuthError` | same shapes, mirrored                         |

Stored token blob layout: `base64( nonce[12] ‖ ciphertext ‖ tag[16] )`. The AES key is
non-exportable and never leaves HUKS; Preferences only ever holds opaque bytes.

## Run

Open `apps/harmony` in **DevEco Studio** (HarmonyOS NEXT / API 12+), let it sync
`oh-package.json5`, then run `entry` on an emulator or device.

1. Start the API: `pnpm --filter @infra/api dev` (listens on `:3001`).
2. Set `API_BASE_URL` in `entry/src/main/ets/common/config.ets`:
   - Emulator → host loopback `http://10.0.2.2:3001` (default).
   - Physical device → the dev machine's LAN IP, e.g. `http://192.168.1.20:3001`.
3. For end-to-end testing without an SMS provider, run the API with
   `OTP_DEBUG_RETURN_CODE=true` (dev only) so the code comes back in the response.

## Lint

ArkTS quality gate is DevEco Studio's **Code Linter** (right-click module → Code Linter),
or the SDK command-line tools:

```bash
cd apps/harmony
codelinter -c ./code-linter.json5 -f json .   # -f default for human-readable output
```

It is a **local** gate — like the build, it needs the DevEco/hvigor toolchain and so
isn't in GitHub CI. Config is [`code-linter.json5`](code-linter.json5); coding
conventions are in `.claude/rules/harmony.md`.

> **Not part of the pnpm pipeline.** HarmonyOS builds with DevEco's hvigor toolchain,
> not tsup/vitest, so this module is excluded from `pnpm build/typecheck/test`. It has
> no `package.json`, so pnpm's `apps/*` workspace glob ignores it. The two binary icons
> under `entry/src/main/resources/base/media/` are DevEco template defaults — see the
> README there.
