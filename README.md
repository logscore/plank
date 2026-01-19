# Plank

A self-hosted media server for streaming movies via torrents.

## Features

- Add magnet links and stream while downloading
- Organize and browse your movie collection  
- Full-text search across your library
- Movie metadata from TMDB
- Secure user accounts
- Docker ready
- Automatically resumes incomplete downloads on restart

## Quick Start

### One-Line Deploy (Linux)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/logscore/plank/master/scripts/deploy.sh)
```

The script will install dependencies, clone the repo, configure environment, and start the app.

### Docker

```bash
git clone https://github.com/logscore/plank.git
cd plank
cp .env.example .env
# Edit your .env file with your environment variables
docker compose -f docker/docker-compose.yml --env-file .env up -d
```

### Bare Metal

```bash
git clone https://github.com/logscore/plank.git
cd plank
cp .env.example .env
# Edit your .env file with your environment variables
npm install
npm run build
npx drizzle-kit migrate
node build
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Path to SQLite database | `./plank.db` |
| `BETTER_AUTH_SECRET` | Auth secret (auto-generated) | - |
| `BETTER_AUTH_URL` | Base URL for auth | `http://localhost:3000` |
| `TMDB_API_KEY` | TMDB API key for metadata | - |
| `PORT` | Server port | `3000` |

## Development

```bash
npm install
npm run dev
```

## License

