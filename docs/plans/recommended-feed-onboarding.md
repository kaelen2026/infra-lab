# 推荐动态 + 匿名浏览 + Onboarding 用户画像

## 目标

让**未登录访客**一进来就能看到一个**人工精选的公开动态流**,通过 onboarding 采集轻量
用户画像(兴趣标签),**匿名期只能看**;任何互动(点赞/评论/发帖/关注)引导去登录;
登录后把 onboarding 期间采集的画像**关联到账号**。

三条产品决策(已与需求方确认):

1. **推荐 = 人工精选池**(不做算法、不做全站公开流)。
2. **匿名只能看**,互动即引导登录(不引入真正的匿名 session)。
3. **登录关联 onboarding 采集的用户画像**(兴趣标签)。

## 与现状的关系(为什么这是"新地基")

当前 timeline 是**严格 per-user 私有流**:`GET/POST/DELETE /timeline` 全部强制
`requireUser` 且按 `userId` 隔离(`apps/api/src/routes/timeline.routes.ts:144-235`、
`services/timeline-repository.ts:9-10`)。唯一的公开读取面是**单条** share
`GET /timeline/share/:id`——不可猜的 UUID 即能力凭证,仅暴露一条 post
(`timeline.routes.ts:171-175`、架构文档 `.claude/docs/architecture.md:72-73`)。
**没有任何推荐/发现/公共 feed、没有匿名会话、没有 onboarding、没有账户/数据关联逻辑**
(Better Auth 只启用 `bearer()`,`packages/auth/src/better-auth.ts:54`)。

本方案因此新增三块能力,均落在既有 ports & adapters + contracts-as-source-of-truth 之上。

---

## 一、人工精选池(推荐动态)

**不动 post 的私有归属,用一张独立"精选表"引用已有 post。** 精选是显式管理动作
(admin console),把某条 post 收进公开池;post 本身仍属于原作者、仍受 `userId` 隔离。

### 数据模型(新表,一条迁移)

`packages/db/schema/timeline.ts` 新增 `timeline_featured`:

- `postId` text PK,FK → `timeline_post.id`,`onDelete: cascade`(post 删了自动移出池)。
- `rank` integer(人工排序,小在前)。
- `featuredBy` text,FK → `user.id`(哪个 admin 精选的,审计用)。
- `featuredAt` timestamptz default now。
- 索引 `(rank asc, featured_at desc)` 服务公开列表查询。

> 取舍:选独立表而非在 `timeline_post` 上加 `featured` 布尔位——精选是运营域概念,
> 与用户私有流解耦更干净,且天然带排序/审计字段,不污染热路径的 keyset 索引。

### 后端(公开读 + admin 写)

- **公开读** `GET /timeline/recommended?cursor=&limit=`(**无 `requireUser`**,与
  `/timeline/share/:id`、`/uploads/:name` 同属公开面)。返回精选 post + **作者公开信息**
  (displayName、avatarUrl),keyset 分页复用现有游标风格。
- **admin 写**(挂在 `/admin` 域,`requireUser` + role=admin):
  `POST /admin/timeline/featured`(收录)、`DELETE /admin/timeline/featured/:postId`(移出)、
  可选 `PATCH` 调 rank。复用现有 admin 鉴权(`packages/shared/src/contracts/admin.ts`)。
- Repository 新增 `TimelineFeaturedRepository` 端口(list 公开池 join 作者 profile、
  add/remove/reorder),adapter 在 `services/` 实现,注入路由——与 todo/timeline 同分层。

### 隐私边界(重要)

公开 feed **会暴露作者的 displayName + avatarUrl + post 正文/图片**——这是精选这一
**显式运营动作**的预期结果,不泄露 phone/私有列表。新增 DTO `RecommendedPostDTO`
只含公开字段(不复用可能带敏感信息的内部结构);正文/图片沿用既有
`/uploads/:name` 公开图片服务。

---

## 二、匿名只能看,互动引导登录

**不引入真正的匿名 session**(方案取舍见下)。推荐 feed 是**无状态公开只读**,
前端未登录直接拉 `GET /timeline/recommended`,无 cookie、无 token。

- 任何写/互动入口(点赞、评论、发帖、关注、进入私有 timeline)在未登录态下**不发请求**,
  直接弹出/跳转 onboarding→登录。
- 后端天然安全:所有写接口本就 `requireUser`,匿名请求返回 401——前端只是提前拦截以给出
  更好的引导体验,不依赖后端做匿名放行。

> 取舍:**放弃 Better Auth anonymous plugin / 自研匿名 session**。因为"匿名只能看",匿名期
> 不产生任何归属数据,真匿名 session 带来的 merge、滥用、限流、清理成本没有收益。若日后
> 要"匿名期点赞/收藏并继承",再单独立项引入匿名 session——本方案在契约上不堵这条路。

---

## 三、登录关联 onboarding 用户画像

onboarding 采集**轻量兴趣标签**(如从固定标签集中多选)。匿名期这份画像**只存在客户端**
(web/h5 用 `localStorage`,native 用本地存储);**登录成功后**再持久化到账号。

### 数据模型(扩展 profile,一条迁移)

`profile` 表(`packages/db/schema/auth.ts:89-100`)新增:

- `interests` jsonb(字符串标签数组,default `[]`),或用关联表——**首版用 jsonb**,标签集小、
  读写整体,YAGNI。
- `onboardedAt` timestamptz nullable(标记是否已完成过 onboarding,幂等判据)。

### 契约与流程

- 画像**不塞进 OTP verify 请求**(auth 与 profile 解耦)。登录成功拿到 session 后,客户端
  调用新的持久化端点:
  - **扩展 profile 契约**:`PATCH /auth/profile` 增加可选 `interests` 字段,或新增
    `POST /auth/onboarding`(`requireUser`)接收 `{ interests }` 并**仅在 `onboardedAt` 为空时
    写入**(首登生效、幂等、不覆盖用户后续在设置里改的画像)。
  - 契约落 `packages/shared/src/contracts/auth.ts`(或 profile 契约),Zod schema 校验
    标签白名单 + 数量上限。
- 客户端流程:onboarding 选标签 → 存本地 → 走登录 → `onAuthenticated` 回调里(web
  `apps/web/features/auth/auth-page.tsx:23-28` 是天然接入点)把本地画像 POST 上去 → 清本地。

---

## 影响面与成本

| 变更 | 文件/层 | 影响面 | 成本(粗估) |
|---|---|---|---|
| 新表 `timeline_featured` | `packages/db/schema/timeline.ts` + 迁移 | 数据模型 | 低 |
| 扩展 `profile`(interests/onboardedAt) | `packages/db/schema/auth.ts` + 迁移 | 数据模型 | 低 |
| 公开 `GET /timeline/recommended` + DTO | `contracts/timeline.ts`、`timeline.routes.ts`、新 repository | **跨端契约**(4 端 + h5) | 中 |
| admin 精选写接口 | `contracts/admin.ts`、admin 路由、repository | 后端 + web admin | 中 |
| onboarding 画像持久化接口 | `contracts/auth.ts`、`auth.routes.ts`、profile repo | **跨端契约** | 中 |
| SDK:`getRecommended`(公开)+ 画像持久化 | `packages/sdk` | 所有客户端 | 中 |
| Web/H5:onboarding 页 + 推荐 feed 页 + 互动拦截 | `apps/web`、`apps/h5` | 前端 | 中-高 |
| Native(ios/android/harmony):对齐 | 各 app | 前端 | 高(可后续分期) |

**跨端契约变更**(推荐 feed、onboarding 画像)需四端契约字节兼容同步,详见
`.claude/docs/architecture.md`。

## 建议实施顺序(分期,每期可独立合入)

1. **后端 + 契约 + SDK**:`timeline_featured` 表、公开 `GET /timeline/recommended`、
   admin 精选写、profile 扩展 + onboarding 持久化端点。带 hermetic 单测(公开 feed 免认证、
   admin 写鉴权、画像幂等)。
2. **Web/H5**:onboarding 页(选兴趣)+ 推荐 feed 页 + 互动引导登录 + 登录后画像上报。
3. **Native**:iOS/Android/Harmony 对齐推荐 feed 与 onboarding。

## 待确认

- **精选入口**:admin console 手动收录,还是也接受"作者主动投稿到公开池"?本方案先按前者。
- **兴趣标签集**:固定白名单从哪来(设计侧 `@infra/design` COPY?还是后端配置)?
- **推荐 feed 里作者可点开吗**:点作者头像是否进一个"作者公开主页"?若要,需要再开一个
  公开的"某作者的公开 post 列表"能力(比单条 share 大),本方案暂不含,默认只读单条流。
