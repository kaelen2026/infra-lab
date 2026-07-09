# Build the h5 static SPA and serve it with nginx. See apps/h5/docs/deployment.md.
#
# Build context is the MONOREPO ROOT (pnpm workspace), not apps/h5:
#   docker build -f apps/h5/Dockerfile --build-arg VITE_API_URL="" -t infra-h5 .
#
# Recommended: add a repo-root .dockerignore with `node_modules`, `**/dist`, `.git`
# so the build context stays small (pnpm reinstalls from the lockfile anyway).

# ---- build ----
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# API base is inlined at build time. "" ⇒ relative calls (same-origin topology);
# pass an absolute origin for the cross-origin topology (needs API CORS + cookie
# changes — see docs/deployment.md §2).
ARG VITE_API_URL=""
RUN VITE_API_URL="$VITE_API_URL" pnpm --filter @infra/h5 build

# ---- serve ----
# Unprivileged variant: runs as user nginx (101), pid/cache under /tmp, and the
# server must therefore listen on a port > 1024 — 8080 here and in nginx.conf.
# Host mappings choose their own public port (e.g. compose `H5_PORT:8080`).
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=build /repo/apps/h5/dist /usr/share/nginx/html
COPY apps/h5/docs/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
