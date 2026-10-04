# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:24.21.0-trixie-slim@sha256:db3ae80f5d8df06e04dabdf7b44cbf008d32de168205fa0294444aabbc08c590

FROM ${NODE_IMAGE} AS base
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

COPY .npmrc package.json package-lock.json ./
COPY scripts/install-git-hooks.mjs scripts/install-git-hooks.mjs
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/canonical-schema/package.json packages/canonical-schema/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/consumption/package.json packages/consumption/package.json
COPY packages/food-knowledge/package.json packages/food-knowledge/package.json
COPY packages/persistence/package.json packages/persistence/package.json
COPY packages/persistence-indexeddb/package.json packages/persistence-indexeddb/package.json
COPY packages/persistence-postgresql/package.json packages/persistence-postgresql/package.json
COPY packages/recipe-knowledge/package.json packages/recipe-knowledge/package.json
COPY packages/user-context/package.json packages/user-context/package.json

FROM base AS dependencies
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci

FROM dependencies AS development

FROM dependencies AS source
COPY . .

FROM source AS verify
ENV CI=true
RUN npm run check

FROM source AS api-build
ENV CI=true
RUN npm run build --workspace=@nutrixx/api

FROM base AS api-production-dependencies
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --workspace=@nutrixx/api --include-workspace-root
RUN mkdir -p apps/api/node_modules

FROM ${NODE_IMAGE} AS api
WORKDIR /workspace
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3001

COPY --from=api-production-dependencies /workspace/node_modules ./node_modules
COPY --from=api-production-dependencies /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=api-production-dependencies /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=api-build --exclude=*.map /workspace/apps/api/dist ./apps/api/dist
COPY --from=api-build --chown=node:node /workspace/packages/config ./packages/config

USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]

FROM source AS web-build
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
ENV CI=true \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build --workspace=@nutrixx/canonical-schema \
    && npm run build --workspace=@nutrixx/persistence \
    && npm run build --workspace=@nutrixx/persistence-indexeddb \
    && npm run build --workspace=@nutrixx/user-context \
    && npm run build --workspace=@nutrixx/web

FROM ${NODE_IMAGE} AS web
WORKDIR /workspace
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=web-build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node --exclude=README.md /workspace/apps/web/public ./apps/web/public

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
