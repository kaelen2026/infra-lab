# @infra/bot 运行镜像。构建上下文是**仓库根**（要读 pnpm workspace 清单与 lockfile）：
#   docker build -f apps/bot/Dockerfile -t infra-bot .
#   docker run --rm --env-file apps/bot/.env infra-bot
# 纯出站长连接服务，不监听端口；配置经 --env-file 注入。
#
# 网络慢/连不上 registry.npmjs.org 时（如国内），走镜像源：
#   docker build -f apps/bot/Dockerfile --build-arg NPM_REGISTRY=https://registry.npmmirror.com -t infra-bot .

FROM node:24-slim AS build
ENV HUSKY=0
# npm registry（corepack 下 pnpm 本体 + pnpm 装包都用）。默认官方源，行为不变；
# 慢网可用 --build-arg NPM_REGISTRY=... 换镜像源。
ARG NPM_REGISTRY=https://registry.npmjs.org
ENV COREPACK_NPM_REGISTRY=${NPM_REGISTRY}
ENV npm_config_registry=${NPM_REGISTRY}
RUN corepack enable
WORKDIR /repo

# 整个 workspace 拷进来（.dockerignore 已排除 node_modules/dist/.git）——所有包的
# package.json 都在，--frozen-lockfile 才能校验。用 `@infra/bot...`（末尾 "..." 选中 bot
# 及其 workspace 依赖）：既装 bot、也装 @infra/env 的完整依赖树（@infra/env 要 zod 才能做
# dts build）；根 project（infra-lab）提供 tsup/esbuild。仍跳过 web/android 等重依赖。
COPY . .
RUN pnpm install --frozen-lockfile --filter "@infra/bot..." --filter infra-lab
# 必须构建 bot 及其 workspace 依赖（@infra/env）。只 build @infra/bot 会漏掉 @infra/env，
# 部署后启动即 `Cannot find module @infra/env/dist/bot.js`（tsup 不 bundle workspace 依赖，
# @infra/env 作为外部包必须有自己已构建的 dist/）。
RUN pnpm --filter "@infra/bot..." build

# 产出自包含部署目录：prod node_modules + 已构建 dist（含 prompt.md）。
# 本仓库未设 inject-workspace-packages，用 --legacy 走旧版 deploy 算法。
RUN pnpm --filter=@infra/bot --prod --legacy deploy /app

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
# 纯出站服务、不落盘,直接以 node:24-slim 自带的非特权 `node` 用户运行。
USER node
CMD ["node", "dist/index.js"]
