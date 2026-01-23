# Plank Architecture & Design Documentation

This may be out of date. Please refer to the [README](/README.md) for the latest information.

## Overview

Plank is a self-hosted media server that enables users to stream movies and TV shows via BitTorrent. The application allows users to add magnet links, download content in real-time while streaming, and organizes their media library with metadata from The Movie Database (TMDB).

**Key Technologies:**
- **Runtime:** Node.js with SvelteKit (full-stack framework)
- **Database:** SQLite with Drizzle ORM
- **Authentication:** Better-Auth
- **Torrent Client:** WebTorrent (JavaScript BitTorrent implementation)
- **Torrent Indexer:** Jackett (with FlareSolverr to bypass Cloudflare)
- **Video Transcoding:** FFmpeg with fluent-ffmpeg
- **Styling:** Tailwind CSS
- **Language:** TypeScript

---

## Core Data Model

### Schema Overview

```
User
├── Media (movies/tv shows)
│   ├── Seasons
│   │   └── Episodes
│   └── Downloads (multiple torrents per show)
```

### Tables

| Table | Description |
|-------|-------------|
| `user` | User accounts |
| `session` | Auth sessions (JWT-based) |
| `account` | OAuth provider accounts |
| `verification` | Email verification tokens |
| `media` | Movies and TV shows (unified) |
| `seasons` | TV show seasons |
| `episodes` | Individual episodes |
| `downloads` | Tracks multiple torrents per media |

### Media Table

The `media` table stores both movies and TV shows with fields for:

- **Identification:** `id`, `userId`, `tmdbId`
- **Content:** `type` (movie/tv), `title`, `year`, `overview`
- **Visuals:** `posterUrl`, `backdropUrl`
- **Technical:** `magnetLink`, `infohash`, `filePath`, `fileSize`
- **Status:** `status` (added/downloading/complete/error), `progress`
- **Metadata:** `runtime`, `genres`, `certification`, `totalSeasons`
- **Timestamps:** `addedAt`, `lastPlayedAt`

### Downloads Table

Enables multiple torrents per TV show (different seasons from different torrents):

- `mediaId` - Links to parent media
- `magnetLink`, `infohash` - Torrent identification
- `status`, `progress` - Download state per torrent

---

## Key Systems

### 1. Torrent Download System (`torrent.ts`)

**Singleton WebTorrent Client:**
- Initialized lazily on first use
- Manages all active torrents in memory
- Configured with 100 max connections and unlimited bandwidth

**Active Downloads Tracking:**
```typescript
const activeDownloads = new Map<string, ActiveDownload>();
const pendingDownloads = new Map<string, Promise<void>>();
```

**Download Flow:**
1. User submits magnet link via `/api/media`
2. `startDownload()` is called with mediaId and magnet link
3. Infobox is extracted from magnet using regex (urn:btih:...)
4. WebTorrent client adds the torrent
5. For movies: single video file is selected
6. For TV shows:
   - Files are mapped to episodes via filename parsing (S01E01, 1x01 patterns)
   - Episodes and seasons are created in the database
   - Files are auto-numbered if mapping fails
7. Metadata is fetched from TMDB in background
8. Video is selected for priority downloading

**Completion Handling:**
- When download reaches 100%, file is moved from `temp/` to `library/`
- For TV shows, files are organized into `library/{mediaId}/Season NN/`
- Database is updated with final file paths
- Torrent is destroyed (files retained in library)

**Recovery on Startup:**
- On server start, incomplete downloads are detected
- If files exist in temp directory, they're finalized to library
- Otherwise, downloads are restarted from the magnet link

### 2. Streaming System (`stream/+server.ts`)

**Request Flow:**
```
GET /api/media/{id}/stream
  ├─ Check auth
  ├─ Ensure download is started
  ├─ Wait for video to be ready (up to 30s)
  ├─ Get stream from:
  │   ├─ Library (complete downloads)
  │   └─ Active torrent (in-progress downloads)
  ├─ Handle formats:
  │   ├─ Native (MP4, WebM): Range requests supported
  │   └─ Container (MKV, AVI): Transmux to MP4 on-the-fly
  └─ Return Response with appropriate headers
```

**Key Functions:**
- `ensureVideoReady()` - Starts download if needed, waits for buffer
- `getVideoStream()` - Routes to library or active torrent
- `handleRangeRequest()` - Supports HTTP range headers for seeking
- `createTransmuxResponse()` - FFmpeg-based MKV→MP4 conversion

**Streaming Features:**
- HTTP Range headers for seeking in native formats
- Transmuxing (container change, no re-encoding) for MKV/AVI
- Progress tracking for playback position
- File selection for TV episodes

### 3. TMDB Integration (`tmdb.ts`)

**Search & Metadata:**
- `searchMovie()` - Search movies by title/year
- `searchTVShow()` - Search TV shows by title/year
- `getMovieDetails()` - Full movie metadata with certification
- `getTVDetails()` - Full TV show metadata
- `getSeasonDetails()` - Season/episode information

**Image Handling:**
- Posters and backdrops are downloaded from TMDB
- Saved to local storage (`data/{category}/{id}/`)
- Served via `/images/[...path]` route

**TV Show Detection:**
- Filename patterns: S01E01, 1x01, Season 1, etc.
- Used to auto-detect media type from magnet link

### 4. Transcoding (`transcoder.ts`)

**Format Support:**
| Format | Browser Support | Handling |
|--------|-----------------|----------|
| MP4 | Native | Stream directly |
| WebM | Native | Stream directly |
| MKV | No | Transmux to MP4 |
| AVI | No | Transmux to MP4 |
| MOV | No | Transmux to MP4 |
| M4V | No | Transmux to MP4 |

**Transmuxing Process:**
1. Input stream created from source (torrent or file)
2. FFmpeg runs with:
   - Input format forced to matroska (for MKV detection)
   - Output format set to MP4
   - Video stream copied (no re-encoding)
   - Audio transcoded to AAC (browser compatible)
3. Output piped to response as streaming MP4

### 5. Authentication (`auth.ts`, `hooks.server.ts`)

**Better-Auth Configuration:**
- Email/password authentication
- 7-day session expiry with 1-day update window
- SQLite adapter with Drizzle schema

**Route Protection:**
- `/login`, `/register`, `/api/auth/*` - Public
- `/`, `/watch/**`, `/search`, `/account` - Protected (requires auth)
- API routes (except auth) - Return 401 if not authenticated

**Server Hooks:**
1. Session verification on every request
2. Download recovery on startup
3. Daily temp folder cleanup (midnight cron)

### 6. Database Access Layer (`db.ts`)

**Repository Pattern:**
Each table has a dedicated accessor:

| Accessor | Methods |
|----------|---------|
| `mediaDb` | list, get, create, updateProgress, updateFilePath, delete, etc. |
| `seasonsDb` | create, getByMediaId, getByMediaAndNumber, updateEpisodeCount |
| `episodesDb` | create, getBySeasonId, getByIdWithSeason, updateFileInfo, bulkUpdateDisplayOrder |
| `downloadsDb` | create, getByMediaId, getByInfohash, updateProgress |

---

## API Endpoints

### Media

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/media` | List user's media (optional `?type=movie\|tv`) |
| POST | `/api/media` | Add new media from magnet link |
| GET | `/api/media/{id}` | Get single media with seasons/episodes |
| DELETE | `/api/media/{id}` | Delete media and associated files |

### Streaming

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/media/{id}/stream` | Stream video (with `?episodeId=` for TV) |
| GET | `/api/media/{id}/progress/stream` | Stream playback progress |

### TV Show Specific

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/media/{id}/seasons` | List seasons |
| GET | `/api/media/{id}/seasons/{num}` | Get specific season |
| POST | `/api/media/{id}/episodes/reorder` | Reorder episodes manually |
| POST | `/api/media/{id}/retry` | Retry failed download |

### Search

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/search` | Global media search |
| GET | `/api/media/search` | TMDB-powered search |
| GET | `/api/media/{id}/seasons` | Get season details from TMDB |

---

## Configuration

Configuration is loaded from environment variables with fallback defaults:

```typescript
const config = {
  paths: {
    data: './data',
    library: './data/library',
    temp: './data/temp',
  },
  tmdb: {
    apiKey: process.env.TMDB_API_KEY,
    baseUrl: 'https://api.themoviedb.org/3',
    imageBaseUrl: 'https://image.tmdb.org/t/p/w500',
  },
};
```

**Environment Variables:**

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite database path | `./plank.db` |
| `DATA_PATH` | Base data directory | `./data` |
| `AUTH_SECRET` | Auth signing secret | Required |
| `AUTH_URL` | Base URL for auth | `http://localhost:3000` |
| `TMDB_API_KEY` | TMDB API key | Required for metadata |
| `PORT` | Server port | `3000` |

---

## Key Flows

### 1. Adding a Movie

```
User POSTs magnet link
    ↓
Validate magnet, extract infohash
    ↓
Check for duplicate (same infohash)
    ↓
Fetch TMDB metadata (async)
    ↓
Create media record (status: 'added')
    ↓
Create download record
    ↓
Start download via WebTorrent
    ↓
Return media to user
```

### 2. Adding a TV Show Season

```
User POSTs magnet link for new season
    ↓
Extract TMDB ID from magnet metadata
    ↓
Check if show exists (by TMDB ID)
    ↓
If exists:
    ├─ Create new download record for existing show
    └─ Start download (episodes added to existing show)
If new:
    ├─ Create new media record
    ├─ Create initial download record
    └─ Start download
```

### 3. Streaming a Video

```
Client requests stream
    ↓
Verify auth
    ↓
Ensure download is started
    ↓
Wait for video to be ready (buffer threshold)
    ↓
Get stream source:
    ├─ Library file (complete)
    └─ Active torrent (in-progress)
    ↓
Handle format:
    ├─ Native: Support Range headers for seeking
    └─ Container: Transmux via FFmpeg
    ↓
Return stream with appropriate headers
```

### 4. Server Startup Recovery

```
Server starts
    ↓
recoverDownloads() called
    ↓
Query DB for incomplete media (status: 'downloading' or 'added')
    ↓
For each incomplete:
    ├─ If file exists in temp: Finalize to library
    └─ If no file: Restart download from magnet
    ↓
Temp folder cleanup cron job scheduled (midnight)
```

---

## File Storage

```
data/
├── library/          # Finalized media files
│   └── {mediaId}/
│       ├── movie.mp4
│       └── Season 01/
│           └── episode.mkv
├── temp/             # Active downloads (cleaned daily)
│   └── {mediaId}/
│       └── {infohash}/
│           └── video files
└── images/           # Cached TMDB images
    └── {category}/
        └── {id}/
            ├── poster.jpg
            └── backdrop.jpg
```

---

## Error Handling

### Download Errors
- Failed downloads are marked with `status: 'error'`
- Error message stored in torrent state
- Users can retry via `/api/media/{id}/retry`

### Stream Errors
- Missing files return 404
- Failed transmux returns 500 with error details
- Range requests outside file bounds return 416

### Auth Errors
- Protected routes return 401 for API, redirect for pages
- Session expiry handled automatically by Better-Auth

---

## Testing

The project uses Vitest for unit tests:

```bash
npm run test          # Run all tests
npm run test:watch   # Watch mode
npm run test:coverage # With coverage report
```

Test files located in `src/tests/`:
- `auth.test.ts` - Authentication tests
- `db.test.ts` - Database operations
- `magnet.test.ts` - Magnet parsing tests
- `media.test.ts` - Media API tests
- `movies.test.ts` - Movie-specific tests
- `search.test.ts` - Search functionality
- `storage.test.ts` - Image storage tests
- `tmdb.test.ts` - TMDB integration tests
- `utils.test.ts` - Utility functions

---

## Development Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run check        # Type check + lint
npm run lint         # Biome linting
npm run format       # Code formatting
npm run test         # Run tests
npm run db:generate  # Generate Drizzle migrations
npm run db:migrate   # Run migrations
npm run db:push      # Push schema changes
```

---

## Security Considerations

- All API routes (except auth) require authentication
- Sessions validated on every request via hooks
- File paths are validated before access
- Magnet links validated before processing
- Auth secret required for session management
- No arbitrary code execution in transcoder (copy mode for video)

---

## Limitations & Known Issues

- Single-user support (per database instance)
- No transcoding for incompatible codecs (HEVC, etc.)
- Download speeds depend on torrent peers
- No built-in search index for library
- TMDB API key required for metadata
