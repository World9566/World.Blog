FROM node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS dependencies
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
ARG SITE_URL
ARG REVISION=local
COPY . .
RUN node scripts/ops/build-info.mjs
# Only disposable build settings are used here. Runtime secrets never enter a layer.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    BETTER_AUTH_URL="$SITE_URL" \
    BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
    pnpm build
RUN mkdir -p public

FROM dependencies AS ops
ARG REVISION=local
LABEL org.opencontainers.image.revision=$REVISION
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts /app/tsconfig.json /app/build-info.json ./
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/content ./content
USER node
CMD ["pnpm", "db:deploy"]

FROM base AS runner
ARG REVISION=local
LABEL org.opencontainers.image.revision=$REVISION
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/build-info.json ./build-info.json
COPY --from=build --chown=node:node /app/scripts/ops/runtime.mjs /app/scripts/ops/production-env.mjs ./ops/
USER node
EXPOSE 3000
CMD ["node", "ops/runtime.mjs"]
