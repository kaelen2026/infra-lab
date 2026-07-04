# iOS 编辑用户信息（用户名 / 头像 / 手机号脱敏）

## 背景与目标

账户页此前只读展示用户信息，缺少编辑能力。本次为 **iOS** 增加：

1. **修改用户名**（`profile.displayName`）
2. **修改用户头像**（`profile.avatarUrl`，图片上传）
3. **手机号脱敏显示**（`138****8000`）

其中 1、2 需要后端提供"更新资料"能力，是**跨端契约变更**（新增 `AuthClient`
方法 + 路由），因此在 `packages/shared` 契约、`@infra/sdk` 参考实现、API 路由三处一并落地；
其余原生端（web/android/harmony）本次不实现 UI，作为后续跟进（契约已就绪）。手机号脱敏是
**纯 iOS 展示层**改动,不涉及契约与其它端。

## 数据模型（无变更）

复用既有 `profile` 表(`packages/db/schema/auth.ts`):`display_name` / `avatar_url` 均已存在,
登录时随 `createWithProfile` 建行(默认 null)。本次只是补上**写路径**,无需迁移。

## 后端

### 契约（`packages/shared/src/contracts/auth.ts`,单一真源）

- `updateProfileSchema`:`{ displayName?: string|null; avatarUrl?: string|null }`(`.strict()`)。
  部分更新语义——**省略键 = 不变,显式 `null` = 清空**;`displayName` 去空白后 1..`DISPLAY_NAME_MAX_LENGTH`(50)。
- `ProfileResponse = { ok: true; user: AuthUser }`(更新与头像上传共用)。
- `AUTH_ROUTES.updateProfile = "/auth/profile"`、`AUTH_ROUTES.avatar = "/auth/avatar"`。
- `AuthClient` 接口新增 `updateProfile(input)` 与 `uploadAvatar(bytes, contentType)`。
- **头像图片规则复用**:头像沿用时间线的"一张上传图片"规则(接受类型 + 8 MiB 上限 +
  `TimelineImageContentType`),避免重复定义;`auth.ts` 仅 `import type` 该类型。若后续图片规则
  要脱离时间线语义,可把 `TIMELINE_IMAGE_*` 提取为通用 `IMAGE_*` 常量(本次不做)。

### 路由（`apps/api/src/routes/auth.routes.ts`)

- `PATCH /auth/profile` + `PUT /auth/profile`(同一 handler;PUT 供无 PATCH 的 HarmonyOS
  NetworkKit,和 todo 更新同款做法):校验 → `users.updateProfile` → 返回 `AuthUser`。
- `POST /auth/avatar`(multipart,字段 `file`):校验类型/大小 → 经**共享 `ImageStore`**
  落盘(与时间线同一实例,`server.ts` 注入)→ 写 `profile.avatarUrl` → 返回刷新后的 `AuthUser`。
  一次调用完成"上传 + 落库",客户端无需二次请求。
  - `UNSUPPORTED_IMAGE_TYPE`(415)/`IMAGE_TOO_LARGE`(413)属时间线错误词表,直接以对应状态返回
    (不走 auth 的 `fail` 表);原生端上传前先本地校验以给出精确文案,服务端为兜底。
- `ImageStore` 端口以 `import type` 从 `timeline.routes.ts` 借用——全应用一个图片存储,只借类型无运行时耦合。

### 仓储（`apps/api/src/services/user-repository.ts`)

新增 `updateProfile(userId, patch)`:只更新 `patch` 中出现的键 + `updatedAt`,再经既有 join
回读返回一致的 `UserRecord`(用户不存在 → null → 路由 401)。

### `@infra/sdk`(`packages/sdk/src/client.ts`)

`createAuthClient` 补 `updateProfile`(PATCH JSON)与 `uploadAvatar`(multipart,复刻时间线上传);
`request` 增加可选 `method` 参数以支持 PATCH。web/cli 经此自动获得能力。

## iOS(`apps/ios`)

- **契约镜像** `AuthContracts.swift`:`UpdateProfileInput`(可选字段,`JSONEncoder` 用
  `encodeIfPresent` 自动省略 nil)、`ProfileResponse`、`ProfileLimits`、路由常量。
- **`AuthClient`**(`AuthClient.swift`):协议加 `updateProfile(displayName:)` 与
  `uploadAvatar(_:contentType:)`;`HTTPAuthClient` 经共享 `AuthorizedTransport` 发 PATCH /
  multipart,复用 `.jpeg` 再编码与 401 刷新重试。
- **状态源**:`AuthViewModel.user` 是全局唯一真源;新增 `apply(_:)`,编辑成功后写回,
  账户卡片与导航栏头像随之刷新。
- **编辑流程**:`AccountViewModel` 承载 `saveDisplayName` / `uploadAvatar`(本地校验:非空、
  长度上限、8 MiB;JPEG 0.8 再编码),`EditProfileView`(新)用 `PhotosPicker` 选图、`TextField`
  改名,从 `ProfileCard` 的 `NavigationLink` 进入。
- **头像渲染**:新增共享 `Avatar` 视图(有 `avatarUrl` 用 `AsyncImage`,否则字母组合),
  导航栏按钮与资料卡片共用。
- **手机号脱敏**:`Format.maskedPhone`(去 `+` 与 `+86` 国家码后,保留前 3 后 4,中间 `****`),
  替换 `ProfileCard` 的手机号展示。

## 测试与门禁

- API 路由测试(`apps/api/test/auth.routes.test.ts`):新增 `FakeImageStore` 与 `FakeUserRepository.updateProfile`,
  覆盖 `PATCH/PUT /auth/profile`(改名、超长 400、未认证 401)与 `POST /auth/avatar`
  (落库 + 返回、415、413、未认证)。全量 `pnpm typecheck / test / lint / build` 通过。
- iOS 无 CI 门禁(需 macOS runner),依赖本地 `make lint`;本次严格沿用既有 SDK/VM/View 范式,
  未引入 force-unwrap / `print`。

## 后续(不在本 PR)

- web / android / harmony 的编辑 UI(契约已就绪,只需各端镜像 + 界面)。
- 头像图片规则若要通用化,把 `TIMELINE_IMAGE_*` 提升为 `IMAGE_*`。
- 删除旧头像文件的回收(与时间线同样目前只留在磁盘)。
