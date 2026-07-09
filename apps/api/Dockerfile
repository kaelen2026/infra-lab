# @infra/api 运行镜像。构建上下文是**仓库根**（要读 pnpm workspace 清单与 lockfile）：
#   docker build -f apps/api/Dockerfile -t infra-api .
#   docker run --rm -p 3001:3001 --env-file .env infra-api
# 监听 HTTP（默认 :3001，由 PORT 覆盖）；生产 env 由平台注入（--env-file / secrets）。
# 运行时依赖 Postgres + Redis，且要求 NODE_ENV=production 下的一整套守卫
# （COOKIE_SECURE / TRUSTED_PROXY_COUNT / BETTER_AUTH_SECRET，见 packages/env/src/core.ts）。
#
# 网络慢/连不上 registry.npmjs.org 时（如国内），走镜像源：
#   docker build -f apps/api/Dockerfile --build-arg NPM_REGISTRY=https://registry.npmmirror.com -t infra-api .

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
# package.json 都在，--frozen-lockfile 才能校验。用 `@infra/api...`（末尾 "..." 选中 api
# 及其 workspace 依赖）：装 api 以及 @infra/{auth,db,redis,shared,env} 的完整依赖树（这些包
# 要 build 出各自的 dist）；根 project（infra-lab）提供 tsup/esbuild。跳过 web/android 等重依赖。
COPY . .
RUN pnpm install --frozen-lockfile --filter "@infra/api..." --filter infra-lab
# 必须构建 api 及其所有 workspace 依赖：tsup 不 bundle workspace 依赖（见 tsup.config.ts
# 的 external），@infra/* 作为外部包必须各自有已构建的 dist/，否则启动即
# `Cannot find module @infra/auth/dist/...`。
RUN pnpm --filter "@infra/api..." build

# 产出自包含部署目录：prod node_modules + 已构建 dist。
# 本仓库未设 inject-workspace-packages，用 --legacy 走旧版 deploy 算法。
RUN pnpm --filter=@infra/api --prod --legacy deploy /app

FROM node:24-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3001
# 容器内默认把上传目录固定到 /data/uploads(可被 env 覆盖):该路径在下面预建并
# chown 给 node,这样非 root 也能开箱即用;compose 的 uploads 卷也挂在这里。
ENV UPLOADS_DIR=/data/uploads
WORKDIR /app
COPY --from=build /app ./
# 以非特权用户运行(node:24-slim 自带 `node` 用户)。uploads 目录必须在切换用户前
# 建好并归属 node——命名卷首次挂载会继承镜像内该路径的属主,root 建的目录会让
# 非 root 进程写不进去。
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
EXPOSE 3001
# 就绪探针交给平台探 /ready（探 PG+Redis）；镜像内自带一个轻量 liveness，命中 /health。
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
