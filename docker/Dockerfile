FROM node:22-alpine AS base

# Install git for lefthook and curl for healthcheck
RUN apk add --no-cache git curl

WORKDIR /app

COPY package*.json ./

# Stage 2: Dependencies (Dev)
FROM base AS deps
# Install all deps (including dev)
RUN npm ci
COPY . .
# Make scripts executable
RUN chmod +x /app/docker/entrypoint.sh /app/docker/configure-prowlarr.sh

# Stage 3: Production
FROM deps AS production

# Build-time dummy values for better-auth
ENV BETTER_AUTH_SECRET=dummy-build-secret
ENV BETTER_AUTH_URL=http://localhost:3300

RUN npm run build

# Remove dev deps to keep image light, then reinstall only drizzle-kit
RUN npm prune --production && npm install drizzle-kit

# Create necessary directories
RUN mkdir -p /app/db /app/data/library /app/data/temp

ENV NODE_ENV=production

EXPOSE 3300
EXPOSE 6881

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["/app/docker/entrypoint.sh"]
