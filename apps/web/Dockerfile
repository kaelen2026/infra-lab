# @infra/web runtime image. Build context is the monorepo root:
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
#     -t infra-web .
#
# NEXT_PUBLIC_API_URL is compiled into the Next.js client bundle. Set it to the
# public API origin that browsers should call.

FROM node:24-slim AS build
ENV HUSKY=0
ARG NPM_REGISTRY=https://registry.npmjs.org
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV COREPACK_NPM_REGISTRY=${NPM_REGISTRY}
ENV npm_config_registry=${NPM_REGISTRY}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile --filter "@infra/web..." --filter infra-lab
RUN pnpm --filter "@infra/web..." build

FROM node:24-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# Next standalone output contains the traced server and minimal node_modules.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
