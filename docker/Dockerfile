FROM node:22-bookworm

# Install curl for healthcheck and ffmpeg for transmuxing and subtitle probing
# I don't like this and would rather apt-get install ffmpeg, but the Debian mirrors were broken
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "arm64" ]; then \
    ARCH_NAME="linuxarm64"; \
    else \
    ARCH_NAME="linux64"; \
    fi && \
    curl -L https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-${ARCH_NAME}-GPL.tar.xz -o /tmp/ffmpeg.tar.xz && \
    mkdir -p /tmp/ffmpeg-extract && \
    tar -xf /tmp/ffmpeg.tar.xz -C /tmp/ffmpeg-extract --strip-components=1 && \
    cp /tmp/ffmpeg-extract/bin/ffmpeg /usr/local/bin/ && \
    cp /tmp/ffmpeg-extract/bin/ffprobe /usr/local/bin/ && \
    rm -rf /tmp/ffmpeg* && \
    chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe

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
