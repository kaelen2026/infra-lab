# 补齐仓库根 `.dockerignore`(构建上下文 + 密钥入镜像层)

> 状态:**本 PR 已落地**。新增 `/.dockerignore` 一个文件,补齐四个应用 Dockerfile
> 注释里早已假设、却物理缺失的既有约定。不改任何构建语义。
> 相关 issue:#133(标签 `bug` / `security` / `infra`)。

## 背景与问题

四个应用镜像 `apps/{api,web,h5,bot}/Dockerfile` 都以**仓库根**为构建上下文
(要读 pnpm workspace 清单与 lockfile),并用 `COPY . .` 把整个工作区拷进 build stage:

- `apps/api/Dockerfile:25`、`apps/bot/Dockerfile:23`、`apps/web/Dockerfile:19`、
  `apps/h5/Dockerfile:13` 均为 `COPY . .`。
- `apps/api/Dockerfile:21` 与 `apps/bot/Dockerfile:19` 的注释写着
  「`.dockerignore` 已排除 node_modules/dist/.git」;`apps/h5/Dockerfile:6` 更直接
  「Recommended: add a repo-root `.dockerignore` …」。

但仓库根**并不存在** `.dockerignore`——注释声明的约定从未落地。由此两个隐患:

1. **构建上下文膨胀**:`node_modules/`、`.git/`、`.turbo/`、`**/.next/`、`.uploads/`
   全量传给 docker daemon。这些目录纯属多余——`pnpm install --frozen-lockfile` 从
   lockfile 重装依赖,各应用在 build stage 内各自重新产出 `dist` / `.next`。
2. **密钥进入 build-stage 镜像层 / 缓存**:根目录 `.env`(含真实 `OTP_SECRET` /
   `BETTER_AUTH_SECRET`,gitignored 但本地物理存在)会被 `COPY . .` 复制进 build stage
   的镜像层与 build cache。多阶段构建的**最终镜像**只 `COPY --from=build /app`
   (api/bot)或 `.next/standalone`(web)、`apps/h5/dist`(h5),最终产物不含 `.env`;
   但 build-stage 层与缓存里有——一旦带缓存推送、或 `docker history` / 导出中间层即泄露。

## 方案与取舍

在仓库根新增 `/.dockerignore`,与 `.gitignore` 及各 Dockerfile 的多阶段产物路径对齐。
要点:

- **排除依赖与构建产物**:`node_modules`、`**/dist`、`dist-worker`、`**/.next`、
  `*.tsbuildinfo`。这些都在容器内重建,排除不影响任一构建阶段
  (web 的 `.next/standalone` 由 build stage 内 `next build` 现产,排除宿主机的 `.next`
  正是期望行为)。
- **排除缓存**:`.turbo`、`coverage`。
- **排除密钥与本地 env**:根级 `.env` + `.env.*`,**并成对补 `**/.env` + `**/.env.*`**。
  关键:`.dockerignore` 与 `.gitignore` 语义不同——未带 `**/` 的模式只在构建上下文
  **根目录**匹配、不递归,所以只写根级会漏掉子目录下的物理 `.env`
  (如 `apps/bot/.env`、`apps/api/.env`——`apps/bot/Dockerfile` 注释里的
  `--env-file apps/bot/.env` 正暗示其存在),仍被 `COPY . .` 带进 build 层,与本 PR 目标相悖。
  用 `!.env.*.example` + `!**/.env.example` 保留已入库示例文件
  (根级 `.env.example` / `.env.deploy.example` / `.env.free.example` 与子目录
  `apps/bot/.env.example`)。示例文件构建并不需要,保留只为「排 `.env.*` 时不误伤已入库
  文件」的稳妥,可按需精简。
- **排除运行时/本地产物**:`.uploads`、`.git`、`.DS_Store`、`.vscode`、
  `**/test-results`、`**/playwright-report`。

**取舍**:未采用「逐个 Dockerfile 各写一份 ignore」——`.dockerignore` 是按构建上下文
(此处统一为仓库根)生效的,根级单文件即覆盖四个镜像,也正是各注释所假设的形态。
四个 Dockerfile 均无读取 `.git`(无嵌 commit SHA),故排除 `.git` 安全。

## 涉及文件

- 新增 `/.dockerignore`。
- 无契约 / 数据模型 / 代码逻辑变更;非跨端改动。

## 验证方式

- `pnpm lint && pnpm typecheck`:纯配置文件,不影响 TS 工具链,应保持全绿。
- 行为验证(可选,依赖本地 docker):`docker build -f apps/api/Dockerfile -t infra-api .`
  的 "Sending build context" 体积应显著下降;`.env` 不再出现在 build stage 层。

## 已知限制

- 仅收敛构建上下文,不改变最终运行镜像内容(最终镜像本就不含被排除项)。
- 若未来某 Dockerfile 改为需要 `.git`(如注入 commit SHA)或某个 `.env.*`,需相应放开。
