# Plank

A self-hosted media server for streaming movies via torrents.

## Features

- Add magnet links and stream while downloading
- Browse and search your movie collection 
- Search for movies and TV shows, just like Netflix
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

---

## 🚨 Legal Disclaimer & Safety Warning

**IMPORTANT:** This software is provided for educational and legitimate use only. Users are solely responsible for ensuring compliance with their local copyright laws and regulations.

### ⚠️ Your Responsibility:
- **Copyright Laws:** Check your country's copyright laws before using torrents
- **File Safety:** I as the developer have **no control** over torrent content, safety, or legality
- **Use at Your Own Discretion:** All torrent downloads are at your own risk
- **Privacy Protection:** Strongly consider using a VPN for privacy protection

### 🔒 Security Recommendations:
- Use a reputable VPN or tunnel service for all torrent activities
- Scan downloaded files with antivirus software
- Verify file contents before opening
- Never download suspicious or unverified torrents
- Never run executable likes like .exe, .bat, .scr unless you explicitly intend to (ie. video games)

### 📋 What This Software Does:
- Provides a media streaming interface for torrent content
- Integrates with Prowlarr for torrent search functionality
- Does NOT host, upload, or distribute any copyrighted material accessible on the internet

---

## 📋 First-Time Setup Guide

### Step 0: Installation

We recommend using Docker for installation as it automatically sets up Prowlarr and FlareSolverr for torrent browsing.

If you wish to use the bare metal version, you will need to manually run those services. That documentation can be found [here](https://wiki.servarr.com/prowlarr/installation) and [here](https://github.com/flaresolverr/flaresolverr).

You can also opt out of those services by not configuring them if you want to manually add media files to your media library via magnet links.

### Step 1: Prowlarr Configuration

This application uses Prowlarr as a torrent search proxy. Prowlarr is pre-configured for connection but requires setup to pull in your desired torrent indexers.

#### Access Prowlarr Web Interface:
After starting Docker containers, access Prowlarr at: `http://localhost:9696`

#### Authentication:
On first run, Prowlarr may ask you to configure authentication. We recommend you set a username and password to secure your indexer configuration.

#### API Key Configuration:

1. Go to **Settings** > **General** in Prowlarr
2. Copy the **API Key**
3. Update your env config by navigating to the `/settings` page and add in the key to the API key field, or edit your `.env` file and edit the following line:
   ```bash
   PROWLARR_API_KEY=your_copied_api_key_here
   ```
4. Restart the containers to apply the new API key (if using the `.env` file).

### Step 2: Configure Torrent Indexers

Torrent indexers are the sources that provide torrent search results. Choose based on your content preferences:

#### 🎬 General Entertainment Package
Recommended for most users seeking movies, TV shows, and general content:

1. **YTS** - Movies only, high quality, small file sizes
2. **1337x** - Well-established tracker, mixed content types (not stable sometimes)
3. **The Pirate Bay** - Largest library, requires careful verification

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

### Step 3: Add Indexers in Prowlarr

1. Open Prowlarr web interface: `http://localhost:9696`
2. Click **"Add Indexer"**
3. Search for your chosen indexers from the lists above
4. Click on the indexer to configure it
5. Most indexers just need to be saved (no additional setup)
6. Click **"Test"** to verify connection, then **"Save"**
7. Repeat for each indexer you want to add

### Step 4: Enhanced Environment Setup

Update your `.env` file with these essential variables:

```bash
# Required variables (edit as needed)
ENABLE_FILE_STORAGE=true # A future flag for strictly streaming torrents and not saving them. Leave as true
DATABASE_URL=./plank.db

TMDB_API_KEY=your_tmdb_api_key_here # Needed for movie metadata like title, rating and posters. 
PROWLARR_URL=http://prowlarr:9696 # Use service name 'prowlarr' if inside docker, or localhost:9696 if bare metal
PROWLARR_API_KEY=your_prowlarr_api_key_here # Needed for online media search

BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3300
PORT=3300
ORIGIN=http://localhost:3300 # Required for Docker CSRF protection
```

### Step 5: Verify Your Setup

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

### Step 6: Security Best Practices

#### 🛡️ Essential Security Measures:

**VPN Usage (Strongly Recommended):**
- Use a reputable VPN service for all torrent activities
- Ensure your VPN has a no-logs policy
- Consider a kill switch feature for connection drops

**Network Security:**
- Run this software in a Docker container (already configured)
- Consider network isolation if possible
- Use TailScale for direct encrypted access 
- Keep your system and antivirus software updated

**File Safety:**
- Scan downloaded files before opening
- Be cautious of executable files (.exe, .bat, .scr)
- Verify file sizes and types match expectations
- Use file scanning tools for suspicious content

### 🔧 Troubleshooting Common Issues

#### Prowlarr Connection Problems:
**Issue:** Can't access Prowlarr web interface
- **Solution:** Check if containers are running: `docker ps`
- **Solution:** Verify port 9696 isn't blocked by firewall
- **Solution:** Restart containers: `docker compose restart`

#### Indexer Setup Problems:
**Issue:** Indexer configuration fails
- **Solution:** Check internet connection
- **Solution:** Try different indexer url (some may be down)
- **Solution:** Check if FlareSolverr is running (needed for some indexers)

**Issue:** No search results
- **Solution:** Ensure at least one indexer is configured and tested
- **Solution:** Check if FlareSolverr is running: `http://localhost:8191`
- **Solution:** Try different search terms

#### Docker Issues:
**Issue:** Container fails to start
- **Solution:** Check environment variables in `.env` file
- **Solution:** Verify Docker is running: `docker version`
- **Solution:** Check port conflicts (3300, 9696, 8191)

**Issue:** "Cross-site POST form submissions are forbidden"
- **Solution:** Ensure `ORIGIN` env var matches your browser URL (e.g. `http://localhost:3300`, `http://192.168.1.2:3300`, etc.)

**Issue:** Permission errors
- **Solution:** Check volume permissions for media directories
- **Solution:** Ensure proper PUID/PGID if using custom user IDs

#### Performance Issues:
**Issue:** Slow torrent downloads
- **Solution:** Use an ethernet connection instead of WiFi
- **Solution:** Configure port forwarding for 6881 (the exposed torrent client port) in your router
- **Solution:** Check VPN isn't throttling speeds
- **Solution:** Verify tracker health in Prowlarr

**Issue:** Memory usage high
- **Solution:** Monitor Docker container resource usage
- **Solution:** Limit or expand the container resources

#### Getting Help:
1. Check container logs: `docker compose logs -f`
2. Verify each service is accessible individually
3. Test with minimal configuration first
4. Check GitHub issues for known problems
5. [Email me](mailto:lsreedercontact@gmail.com)

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
| `ORIGIN` | Public URL for CSRF (Docker) | `http://localhost:3300` |
| `PROWLARR_URL` | Prowlarr API URL | `http://prowlarr:9696` |
| `PROWLARR_API_KEY` | Prowlarr API Key | - |

## Development

```bash
npm install
npm run dev
```

## License
