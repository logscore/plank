FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Create necessary directories
RUN mkdir -p /app/db /app/data/library /app/data/temp

ENV NODE_ENV=production

EXPOSE 3000
EXPOSE 6881

CMD ["node", "build"]
