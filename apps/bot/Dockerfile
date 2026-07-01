# @infra/bot 运行镜像。构建上下文是**仓库根**（要读 pnpm workspace 清单与 lockfile）：
#   docker build -f apps/bot/Dockerfile -t infra-bot .
#   docker run --rm --env-file apps/bot/.env infra-bot
# 纯出站长连接服务，不监听端口；配置经 --env-file 注入。

FROM node:24-slim AS build
ENV HUSKY=0
RUN corepack enable
WORKDIR /repo

# 整个 workspace 拷进来（.dockerignore 已排除 node_modules/dist/.git）——所有包的
# package.json 都在，--frozen-lockfile 才能校验。但只装 bot + 根构建工具两个
# project 的依赖（--filter），跳过 web/android 等其它 app 的重依赖，镜像构建更快。
# 根 project（infra-lab）提供 tsup/esbuild，bot 提供运行时依赖。
COPY . .
RUN pnpm install --frozen-lockfile --filter @infra/bot --filter infra-lab
RUN pnpm --filter @infra/bot build

# 产出自包含部署目录：prod node_modules + 已构建 dist（含 prompt.md）。
# 本仓库未设 inject-workspace-packages，用 --legacy 走旧版 deploy 算法。
RUN pnpm --filter=@infra/bot --prod --legacy deploy /app

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
CMD ["node", "dist/index.js"]
