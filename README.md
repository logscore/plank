# Plank

A self-hosted media server for streaming movies via torrents.

> ⚠️ This repo is under heavy development and we dont have a consistent way to migrat your media data in your loal db or on the file system when we make breaking changes. Use this project at your own peril.

## Features

- Add magnet links and stream while downloading
- Browse and search your movie collection 
- Search for movies and TV shows, add to library or stream directly, just like Netflix
- Access to any movie or show
- Secure user accounts
- Profile-like organizations with admin controls
- Docker ready
- Get subtitles in any language

## Quick Start

### One-Line Deploy (Linux)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/logscore/plank/master/scripts/deploy.sh)
```

The script will install dependencies, clone the repo, configure environment, and start the app.

---

## Legal Disclaimer & Safety Warning

**IMPORTANT:** This software is provided for educational and legitimate use only. Users are solely responsible for ensuring compliance with their local copyright laws and regulations.

### Your Responsibility:
- **Copyright Laws:** Check your country's copyright laws before using torrents
- **File Safety:** I as the developer have **no control** over torrent content, safety, or legality
- **Use at Your Own Discretion:** All torrent downloads are at your own risk
- **Privacy Protection:** Strongly consider using a torrent-ready VPN for privacy protection

### Security Recommendations:
- Use a reputable VPN or tunnel service for all torrent activities
- Scan downloaded files with antivirus software (soon-to-be-feature)
- Verify file contents before opening
- Never download suspicious or unverified torrents
- Never run executable likes like .exe, .bat, .scr unless you explicitly intend to (ie. video games)

### What This Software Does:
- Provides a media streaming interface for torrent content
- Integrates with Prowlarr for torrent search functionality
- Does NOT host, upload, or distribute any copyrighted material accessible on the internet

---

## First-Time Setup Guide

> The fastest way to get started is my running the script above. It handles nearly everything for you.

### Prerequisites

We recommend using Docker for installation as it automatically sets up Prowlarr (media torrent searching) and FlareSolverr (captchas) for torrent browsing.

If you wish to use the bare metal version, you will need to manually run those services. That documentation can be found [here](https://wiki.servarr.com/prowlarr/installation) and [here](https://github.com/flaresolverr/flaresolverr).

You can also opt out of those services by not configuring them if you want to manually add media files to your media library via magnet links. The choice is yours.

### Torrent Indexer Guide

Torrent indexers are the sources that provide torrent search results. Choose based on your content preferences:

#### 🎬 General Entertainment Package
Recommended for most users seeking movies, TV shows, and general content:

1. **YTS** - Movies only, high quality, small file sizes
2. **1337x** - Well-established tracker, mixed content types (not stable sometimes)
3. **The Pirate Bay** - Largest library, requires careful verification of media

#### 🎌 Anime Fan Package
Recommended for anime enthusiasts:

1. **Nyaa.si** - Largest anime torrent repository
2. **AnimeTosho** - Automated mirroring service, high reliability
3. **AniDex** - Alternative anime source with good organization

#### 📺 TV Show Specialists
Recommended for TV series focus:

1. **EZTV** - Specialized in TV series, recent episodes
2. **TorrentGalaxy** - Good TV/movie mix, active community
3. **TorLock** - Verified torrents focus, fewer fake files

#### 😩 Gooner Gang

Look it up yourself, you filthy animal

### Enhanced Environment Setup

Update your `.env` file with these essential variables:

```bash
# Database
DATABASE_URL=./plank.db

# Where the files are saved when downloaded
DATA_PATH=./data

# Get yours here https://www.themoviedb.org/settings/api
TMDB_API_KEY=your_tmdb_api_key_here

# Prowlarr (Torrent Search)
PROWLARR_URL=http://prowlarr:9696 # Use service name 'prowlarr' if inside docker, or localhost:9696 if bare metal
PUBLIC_PROWLARR_URL=${PROWLARR_URL}
PROWLARR_API_KEY= # We recommend leaving this blank when running fully self hosted. Configured automatically

# OpenSubtitles (Subtitle Downloads)
# Create and account and get API key at https://www.opensubtitles.com/consumers
OPENSUBTITLES_API_KEY=
OPENSUBTITLES_USERNAME=
OPENSUBTITLES_PASSWORD=

# Authentication
BETTER_AUTH_SECRET=super-secret-32-char-string
BETTER_AUTH_URL=http://localhost:3300

# Reserved for future functionality. Keep as true
ENABLE_FILE_STORAGE=true

PORT=3300
ORIGIN=http://localhost:3300 # Required for Docker CSRF protection
```

### Verify Your Setup

In an ineractive shell:

1. **Start containers:**
   ```bash
   docker compose -f docker/docker-compose.yml --env-file .env up -d
   ```

2. **Check container status:**
   ```bash
   docker ps
   ```
   You should see `plank`, `prowlarr`, and `flaresolverr` running.

3. **Test Prowlarr:**
   - Access `http://localhost:9696`
   - Try searching for content on your configured indexers

4. **Test Plank:**
   - Access `http://localhost:3300`
   - Create an account and try searching for content

### Security Best Practices

#### 🛡️ Essential Security Measures:

**VPN Usage (Strongly Recommended):**
- Use a reputable torrent VPN service for all torrent activities
- Ensure your VPN has a no-logs policy
- Consider a kill switch feature for connection drops

**Network Security:**
- Run this software in a Docker container (already configured)
- Consider network isolation if possible
- Use TailScale for direct encrypted access 
- Keep your system and antivirus software updated

**File Safety:**
- Scan downloaded files before opening
- Never run executable files (.exe, .bat, .scr)
- Verify file sizes and types match expectations
- Use file scanning tools for suspicious content

### 🔧 Troubleshooting Common Issues

#### Prowlarr Connection Problems:
**Issue:** Can't access Prowlarr api
- **Solution:** Check if containers are running: `docker ps`
- **Solution:** Ensure you have the Prowlarr api key by checking the `/settings` page
- **Solution:** Verify port 9696 isn't blocked by firewall (if running outside the docker network)
- **Solution:** Restart containers: `docker compose restart`

#### Indexer Setup Problems:
**Issue:** Indexer configuration fails
- **Solution:** Check internet connection
- **Solution:** Try different indexer url (some may be down)
- **Solution:** Check if FlareSolverr is running (needed for some indexers)

**Issue:** No search results
- **Solution:** Ensure you have a TMDB api key configured in `/settings` search results are dependant on TMDB
- **Solution:** Ensure at least one indexer is configured and tested
- **Solution:** Check if FlareSolverr is running: `http://localhost:8191`
- **Solution:** Try different search terms

#### Docker Issues:
**Issue:** Container fails to start
- **Solution:** Check environment variables in `.env` file
- **Solution:** Verify Docker is running: `docker version`
- **Solution:** Check port conflicts (3300, 9696, 8191)
- **Solution:** Sometimes distro mirrors are out of sync. Wait and try again.

**Issue:** "Cross-site POST form submissions are forbidden"
- **Solution:** Ensure `ORIGIN` env var matches your browser URL (e.g. `http://localhost:3300`, `http://192.168.1.2:3300`, etc.)

**Issue:** Permission errors
- **Solution:** Check volume permissions for media directories
- **Solution:** Ensure proper PUID/PGID if using custom user IDs

#### Performance Issues:
**Issue:** Slow torrent downloads
- **Solution:** Use an ethernet connection instead of WiFi
- **Solution:** Configure port forwarding for 6881 (the exposed torrent client port) in your router
- **Solution:** Check VPN isn't throttling speeds, or that it isnt blocking torrent traffic all together
- **Solution:** Verify tracker health in Prowlarr

**Issue:** Memory usage high
- **Solution:** Monitor Docker container resource usage
- **Solution:** Limit or expand the container resources
- **Solution:** Restart the containers in case of a memory leak

#### Getting Help:
1. Check container logs: `docker compose logs -f`
2. Verify each service is accessible individually
3. Test with minimal configuration first
4. Check GitHub issues for known problems
5. [Email me](mailto:lsreedercontact@gmail.com) if you genuinely can't figure it out. No AI slop or you're insta-banned.

### Docker

> I highly recommend running `./scripts/deploy` for Docker and bare metal deployments.

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
| `DATA_PATH` | Where downloaded files are saved | `./data` |
| `TMDB_API_KEY` | TMDB API key for metadata ([get one here](https://www.themoviedb.org/settings/api)) | - |
| `PROWLARR_URL` | Prowlarr API URL | `http://localhost:9696` |
| `PUBLIC_PROWLARR_URL` | Public-facing Prowlarr URL | Same as `PROWLARR_URL` |
| `PROWLARR_API_KEY` | Prowlarr API key (auto-configured when fully self hosted) | - |
| `OPENSUBTITLES_API_KEY` | OpenSubtitles API key ([get one here](https://www.opensubtitles.com/consumers)) | - |
| `OPENSUBTITLES_USERNAME` | OpenSubtitles account username | - |
| `OPENSUBTITLES_PASSWORD` | OpenSubtitles account password | - |
| `BETTER_AUTH_SECRET` | Auth secret (auto-generated) | - |
| `BETTER_AUTH_URL` | Base URL for auth | `http://localhost:3300` |
| `ENABLE_FILE_STORAGE` | Save downloaded files to disk (reserved for future use) | `true` |
| `PORT` | Server port | `3300` |
| `ORIGIN` | Public URL for CSRF (Docker) | `http://localhost:3300` |

## Development

We develop in Docker containers with live reloads. It keeps the dev environment and production closely knit so writing code that runs everywhere is easier.

Fill in your `.env` then run:

```bash
./scripts/dev.sh
```

## [License](./LICENSE)
