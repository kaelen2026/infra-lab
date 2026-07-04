# Android QR 扫码登录(原生审批端)

## 目标

补齐 Android 端的 **QR 跨端登录**:已登录的 Android App 扫描 web 端展示的登录二维码,
在手机上确认后,该浏览器即以当前 Android 用户的身份登录。这是「Android 对齐 iOS」系列的
一环——iOS 已有 `approveQrLogin` client 方法(见 `apps/ios/InfraLab/Auth/AuthClient.swift`),
但**尚未接入扫码 UI**;Android 本次在提供同一 client 能力的同时,额外接入了可用的扫码入口。

## 流程(契约既有,未改动)

契约与后端已存在,定义在 `packages/shared/src/contracts/auth.ts`(QR 段)与
`apps/api/src/routes/qr.routes.ts`。四步:

1. **浏览器 `POST /auth/qr/create`** → 得到公开 `ticketId` + 私有 `pollToken`,把
   **`ticketId` 原样编码进二维码**(见 `apps/web/features/auth/qr/qr-login-page.tsx:54`
   `<QrCode value={qr.ticketId} />`)。
2. **Android 扫码** → 解码得到 `ticketId`(一个 UUID 字符串,二维码内容就是它本身,不是 URL)。
3. **Android `POST /auth/qr/approve { ticketId }`** → 用**自己的 Bearer 会话**鉴权,把
   pending ticket 绑定到当前用户。**approve 不需要也拿不到 `pollToken`**。
4. **浏览器轮询 `status` → `consume`** → 用 `pollToken` 证明所有权,换取自己的会话 cookie。

安全要点(均由既有后端保证,Android 侧只需正确传 `ticketId`):
- `ticketId` 是**公开能力位**;真正的授权来自扫码 App **自己的登录态**,冒名者无会话则 approve 失败(401)。
- ticket **单次使用 + 120s TTL**;仅 `pending` 可被 approve,二次扫码无法劫持(`QR_ALREADY_USED` / 409)。
- `pollToken` 只在浏览器侧,永不经过原生端。

## Android 实现

- **契约** `data/contracts/Contracts.kt`:新增 `AuthRoutes.QR_APPROVE` 与
  `ApproveQrLoginRequest(ticketId)`,字段与 `approveQrLoginSchema` 字节兼容。
- **传输** `AuthApi.approveQrLogin` + `AuthClientImpl.approveQrLogin`,复用与 auth/todo
  相同的已鉴权 OkHttp 客户端,Bearer 头与 401 刷新自动生效;非 2xx 走 `AuthErrorParser` →
  `AuthException`,错误码复用现有 `AuthCopyGenerated`(QR_NOT_FOUND / QR_ALREADY_USED /
  QR_NOT_APPROVED 的中文文案已由 @infra/design 生成)。
- **状态** `ui/qr/QrApproveViewModel`(`StateFlow`,IDLE/APPROVING/SUCCESS/ERROR):
  `approve(ticketId)` 空串忽略,失败经 `AuthMessages.describe` 映射文案。框架无关、可单测。
- **扫码** `ui/qr/QrScanner`:封装 **Google Code Scanner**(`play-services-code-scanner`)。
  选它的关键原因是**无需 `CAMERA` 权限**(扫描模块自持相机),故 App 不声明相机权限;
  仅识别 `FORMAT_QR_CODE`。`AndroidManifest` 加 `com.google.mlkit.vision.DEPENDENCIES=barcode_ui`
  让模块在安装期预下载。
- **入口** `ui/qr/QrLoginCard`:嵌在账户页(`AccountScreen`)——只有已登录用户才能审批,账户页是
  自然位置。扫码 → `approve` → 展示确认中 / 成功 / 失败。
- **测试** `QrApproveViewModelTest`:成功转发 ticket、空扫忽略、被拒 ticket 出错、reset 归位。

## 取舍与后续

- **超出 iOS 的部分**:iOS 目前无扫码 UI;Android 直接接了可用入口。若要严格保持两端一致,
  后续可给 iOS 补 `DataScannerViewController` 扫码入口(另开工单)。
- **依赖代价**:引入 Google Play Services(`play-services-code-scanner`)。无 GMS 的设备
  (纯 AOSP / 部分海外 ROM)扫码不可用——本项目 Android 客户端面向带 GMS 的设备,可接受;
  如需覆盖无 GMS 设备,替代方案是 CameraX + ML Kit 捆绑版(需 `CAMERA` 权限,代码量更大)。
- **未做**:iOS 的 push(APNS)对应的 Android FCM 仍缺,属另一档基础设施,不在本 PR。
