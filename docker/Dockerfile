FROM node:22-alpine

# Install git for lefthook
RUN apk add --no-cache git

WORKDIR /app

COPY package*.json ./
# Install all deps (including dev) for build
RUN npm ci

COPY . .

# Set dummy secrets for build time - better-auth validates these during build
# Real values are provided at runtime via docker-compose environment
ARG AUTH_SECRET=dummy-build-secret-replace-at-runtime
ARG AUTH_URL=http://localhost:3000
ENV AUTH_SECRET=$AUTH_SECRET
ENV AUTH_URL=$AUTH_URL

RUN npm run build

# Remove dev deps to keep image light, then reinstall only drizzle-kit for migrations
RUN npm prune --production && npm install drizzle-kit

# Create necessary directories
RUN mkdir -p /app/db /app/data/library /app/data/temp

# Install curl for healthcheck
RUN apk add --no-cache curl

# Make entrypoint executable (already copied via COPY . .)
RUN chmod +x /app/docker/entrypoint.sh

ENV NODE_ENV=production

EXPOSE 3300
EXPOSE 6881

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["/app/docker/entrypoint.sh"]
