FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
# Install all deps (including dev) for build
# Use npm install instead of ci to ensure platform-specific optional deps (like rollup-linux) are resolved
RUN npm install

COPY . .

# Set dummy secrets for build time - better-auth validates these during build
# Real values are provided at runtime via docker-compose environment
ARG BETTER_AUTH_SECRET=dummy-build-secret-replace-at-runtime
ARG BETTER_AUTH_URL=http://localhost:3000
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
ENV BETTER_AUTH_URL=$BETTER_AUTH_URL

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
