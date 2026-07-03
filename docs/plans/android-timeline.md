# Android Timeline(图文动态)

## 目标

补齐 Android 端的 **timeline**:按用户隔离的图文动态流(发帖 = 文字 + 图片、删除、无限滚动)。
iOS 已实现完整 timeline;本文档记录 Android 对齐实现。契约与后端既有,未改动
(`packages/shared/src/contracts/timeline.ts`、`apps/api/src/routes/timeline.routes.ts`)。

## 契约与流程(既有)

- 列表 `GET /timeline?cursor=&limit=` → `{ ok, posts, nextCursor }`,最新在前,游标翻页。
- **两步发布**(大二进制不进 JSON body):
  1. `POST /timeline/images`(multipart,字段名 **`file`**)→ `{ ok, image: { url, contentType } }`,
     `url` 是服务端签发的相对路径 `/uploads/<name>.<ext>`。
  2. `POST /timeline`(JSON `{ text, images: [{url}] }`)→ 创建帖子;服务端只接受它签发过的 url。
- 删除 `DELETE /timeline/:id`。
- 图片经 `GET /uploads/:name` 公开读取(不可猜的文件名即能力位),故可直接用 `<img>`/AsyncImage 加载。

## Android 实现(镜像现有 todo 分层 + iOS `TimelineViewModel` 语义)

- **契约** `data/contracts/TimelineContracts.kt`:限额、`TimelineImageContentType`、路由、DTO、
  错误码,字段名与 TS 契约字节兼容。
- **传输** `TimelineApi`(Retrofit)+ `TimelineClientImpl`,复用与 auth/todo **同一个已鉴权
  OkHttp 客户端**——Bearer 头与 401 自动刷新重试自动生效,本层不碰 token。上传用
  `MultipartBody.Part`(字段 `file`,媒体类型即图片类型)。
- **状态** `ui/timeline/TimelineViewModel`(`StateFlow`):`load` / 无限滚动 `loadMore` /
  `publish`(先逐张上传再建帖)/ `remove`。不引入 Android 框架类型,保持可单测;屏幕负责把选中的
  `Uri` 经 `ContentResolver` 读成 `PickedImage(bytes, contentType)` 再交给 VM。
- **UI** `ui/timeline/TimelineScreen`:`LazyColumn` 承载 发布器 + 信息流;图片用 **Coil**
  渲染(缩略图用内存 `ByteBuffer`,信息流用 `BuildConfig.API_BASE_URL + 相对 url`);
  接入 `AuthenticatedShell` 第三个底部 tab「动态」。
- **测试** `TimelineViewModelTest` 镜像 `TodoViewModelTest`(加载 / 分页 / 发布 / 空帖拒绝 /
  删除 / 错误)。

## 取舍

- **图片选择**:用系统 PhotoPicker(`PickMultipleVisualMedia`),**无需存储/相册权限**。
  未做本地重编码/压缩(iOS 会转 JPEG);首版直接上传原始字节并按支持的 MIME 过滤,
  超出 `IMAGE_MAX_BYTES` 或不支持类型的图在客户端先丢弃。
- **依赖**:新增 Coil(`io.coil-kt:coil-compose`)做异步图片加载(iOS 用内置 AsyncImage 的对位)。
- **明文**:dev/debug 经 `src/debug` 的 `usesCleartextTraffic` 走 `http://10.0.2.2`;release 仍 HTTPS。
- **未做**:分享链接 / deep-link 读取(`getShared`)——iOS 的 client 也未实现,属 h5 分享落地页范畴。
