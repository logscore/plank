FROM node:22-bookworm-slim

# Install git for lefthook and curl for healthcheck
RUN rm -rf /var/lib/apt/lists/* && apt-get update && apt-get install -y --no-install-recommends git curl ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
# Install all deps (including dev) for build
RUN npm ci

COPY . .

# Build-time dummy values for better-auth
ENV BETTER_AUTH_SECRET=dummy-build-secret
ENV BETTER_AUTH_URL=http://localhost:3300

RUN npm run build

# Remove dev deps to keep image light, then reinstall only drizzle-kit
RUN npm prune --production && npm install drizzle-kit

# Create necessary directories
RUN mkdir -p /app/db /app/data/library /app/data/temp

# Make scripts executable
RUN chmod +x /app/docker/entrypoint.sh /app/docker/configure-prowlarr.sh

ENV NODE_ENV=production

EXPOSE 3300
EXPOSE 6881

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["/app/docker/entrypoint.sh"]
