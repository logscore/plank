FROM node:22-bookworm AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN BETTER_AUTH_SECRET=dummy-build-secret \
    BETTER_AUTH_URL=http://localhost:3300 \
    npm run build

FROM node:22-bookworm AS prod-deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm AS runtime

ENV NODE_ENV=production \
    PORT=3300 \
    HOST=0.0.0.0 \
    DATA_PATH=/app/data \
    BODY_SIZE_LIMIT=11M


WORKDIR /app

RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/src/lib/server/db/schema.ts ./src/lib/server/db/schema.ts
COPY --from=build /app/docker/entrypoint.sh ./docker/entrypoint.sh
COPY --from=build /app/docker/configure-prowlarr.sh ./docker/configure-prowlarr.sh

RUN mkdir -p /app/db /app/data/library /app/data/temp && \
    chmod +x /app/docker/entrypoint.sh /app/docker/configure-prowlarr.sh && \
    chown -R node:node /app

USER node

EXPOSE 3300
EXPOSE 6881/tcp 6881/udp

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3300/health || exit 1

ENTRYPOINT ["/app/docker/entrypoint.sh"]
