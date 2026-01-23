# Plank Implementation Document

## Overview

Plank is a Netflix-style torrent streaming platform. Video streaming always happens client-side via WebTorrent in the browser. Self-hosted deployments additionally save completed downloads to the filesystem.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | SvelteKit + TypeScript |
| Styling | TailwindCSS |
| Database | SQLite (better-sqlite3) |
| Auth | better-auth |
| Client Streaming | WebTorrent |
| Server Download (self-hosted) | webtorrent-hybrid |
| Metadata | TMDB API |
| Filename Parsing | parse-torrent-title |
| Video Player | video.js |
| Container | Docker |

## Architecture

### SaaS Mode

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│  ┌─────────────┐    ┌─────────────┐    ┌────────────┐  │
│  │  SvelteKit  │───▶│  WebTorrent │───▶│   <video>  │  │
│  │     UI      │    │   Client    │    │   Player   │  │
│  └─────────────┘    └──────┬──────┘    └────────────┘  │
└────────────────────────────┼────────────────────────────┘
                             │
                             ▼
                      Torrent Swarm
                             
┌─────────────────────────────────────────────────────────┐
│                   SvelteKit Server                      │
│  ┌─────────────┐    ┌─────────────┐    ┌────────────┐  │
│  │ better-auth │    │   SQLite    │    │  TMDB API  │  │
│  │             │    │ (metadata)  │    │  (posters) │  │
│  └─────────────┘    └─────────────┘    └────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Self-Hosted Mode

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│  ┌─────────────┐    ┌─────────────┐    ┌────────────┐  │
│  │  SvelteKit  │───▶│  WebTorrent │───▶│   <video>  │  │
│  │     UI      │    │   Client    │    │   Player   │  │
│  └─────────────┘    └──────┬──────┘    └────────────┘  │
└────────────────────────────┼────────────────────────────┘
                             │
                             ▼
                      Torrent Swarm
                             ▲
                             │
┌────────────────────────────┼────────────────────────────┐
│                   SvelteKit Server                      │
│  ┌─────────────┐    ┌─────────────┐    ┌────────────┐  │
│  │ better-auth │    │   SQLite    │    │  TMDB API  │  │
│  └─────────────┘    └─────────────┘    └────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              webtorrent-hybrid                   │   │
│  │         (downloads to filesystem)                │   │
│  └──────────────────────┬──────────────────────────┘   │
└─────────────────────────┼───────────────────────────────┘
                          ▼
                    ┌──────────┐
                    │  /data   │
                    │ library  │
                    └──────────┘
```

## Feature Flags

### Environment Variables

```bash
# .env
ENABLE_FILE_STORAGE=false    # Save completed downloads to filesystem
DATABASE_URL=/app/db/plank.db
TMDB_API_KEY=your_key
BETTER_AUTH_SECRET=your_secret
BETTER_AUTH_URL=http://localhost:5173
```

### Presets

**.env.selfhosted**
```bash
ENABLE_FILE_STORAGE=true
DATABASE_URL=/app/db/plank.db
```

**.env.saas**
```bash
ENABLE_FILE_STORAGE=false
DATABASE_URL=/app/db/plank.db
```

### Config Module

```ts
// src/lib/config.ts
import { env } from '$env/dynamic/private'

export const config = {
  features: {
    fileStorage: env.ENABLE_FILE_STORAGE === 'true',
  },
  paths: {
    library: '/app/data/library',
    temp: '/app/data/temp',
  },
  tmdb: {
    apiKey: env.TMDB_API_KEY,
    baseUrl: 'https://api.themoviedb.org/3',
    imageBaseUrl: 'https://image.tmdb.org/t/p/w500',
  },
}
```

## Database Schema

```sql
-- migrations/001_init.sql

CREATE TABLE user (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  emailVerified INTEGER DEFAULT 0,
  name TEXT,
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE session (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  expiresAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT
);

CREATE TABLE account (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  accessToken TEXT,
  refreshToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE movies (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  year INTEGER,
  posterUrl TEXT,
  backdropUrl TEXT,
  overview TEXT,
  magnetLink TEXT NOT NULL,
  infohash TEXT NOT NULL,
  filePath TEXT,              -- Only populated when ENABLE_FILE_STORAGE=true
  fileSize INTEGER,
  status TEXT DEFAULT 'added', -- 'added', 'downloading', 'complete'
  progress REAL DEFAULT 0,
  tmdbId INTEGER,
  addedAt INTEGER NOT NULL,
  lastPlayedAt INTEGER,
  UNIQUE(userId, infohash)
);

CREATE INDEX idx_movies_user ON movies(userId);
CREATE INDEX idx_movies_status ON movies(status);
```

## Project Structure

```
plank/
├── src/
│   ├── lib/
│   │   ├── server/
│   │   │   ├── db.ts
│   │   │   ├── auth.ts
│   │   │   ├── tmdb.ts
│   │   │   ├── torrent.ts        # Server-side torrent (self-hosted only)
│   │   │   └── magnet.ts
│   │   ├── client/
│   │   │   ├── torrent.ts        # Browser WebTorrent wrapper
│   │   │   └── player.ts
│   │   ├── config.ts
│   │   └── types.ts
│   ├── routes/
│   │   ├── (app)/
│   │   │   ├── +layout.svelte
│   │   │   ├── +page.svelte           # Library view
│   │   │   ├── watch/[id]/
│   │   │   │   └── +page.svelte       # Player
│   │   │   └── search/
│   │   │       └── +page.svelte
│   │   ├── (auth)/
│   │   │   ├── login/+page.svelte
│   │   │   └── register/+page.svelte
│   │   └── api/
│   │       ├── auth/[...all]/+server.ts
│   │       ├── movies/
│   │       │   ├── +server.ts         # GET list, POST add
│   │       │   └── [id]/
│   │       │       ├── +server.ts     # GET single, DELETE
│   │       │       └── progress/+server.ts
│   │       └── search/+server.ts      # TMDB search
│   ├── app.html
│   └── hooks.server.ts
├── static/
├── migrations/
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── docker-compose.selfhosted.yml
├── package.json
├── svelte.config.js
├── tailwind.config.js
└── tsconfig.json
```

## Implementation

### Auth Setup (better-auth)

```ts
// src/lib/server/auth.ts
import { betterAuth } from 'better-auth'
import Database from 'better-sqlite3'
import { env } from '$env/dynamic/private'

const db = new Database(env.DATABASE_URL)

export const auth = betterAuth({
  database: {
    db,
    type: 'sqlite',
  },
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // 1 day
  },
})
```

```ts
// src/lib/auth-client.ts
import { createAuthClient } from 'better-auth/svelte'

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_AUTH_URL || 'http://localhost:5173',
})
```

```ts
// src/routes/api/auth/[...all]/+server.ts
import { auth } from '$lib/server/auth'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ request }) => {
  return auth.handler(request)
}

export const POST: RequestHandler = async ({ request }) => {
  return auth.handler(request)
}
```

```ts
// src/hooks.server.ts
import { auth } from '$lib/server/auth'
import { redirect, type Handle } from '@sveltejs/kit'

export const handle: Handle = async ({ event, resolve }) => {
  const session = await auth.api.getSession({
    headers: event.request.headers,
  })

  event.locals.user = session?.user ?? null
  event.locals.session = session?.session ?? null

  // Protect app routes
  if (event.url.pathname.startsWith('/(app)') || event.url.pathname === '/') {
    if (!event.locals.user) {
      throw redirect(302, '/login')
    }
  }

  return resolve(event)
}
```

### Database Module

```ts
// src/lib/server/db.ts
import Database from 'better-sqlite3'
import { env } from '$env/dynamic/private'
import type { Movie } from '$lib/types'

const db = new Database(env.DATABASE_URL)
db.pragma('journal_mode = WAL')

export const movies = {
  list(userId: string): Movie[] {
    return db
      .prepare('SELECT * FROM movies WHERE userId = ? ORDER BY addedAt DESC')
      .all(userId) as Movie[]
  },

  get(id: string, userId: string): Movie | null {
    return db
      .prepare('SELECT * FROM movies WHERE id = ? AND userId = ?')
      .get(id, userId) as Movie | null
  },

  create(movie: Omit<Movie, 'id'>): Movie {
    const id = crypto.randomUUID()
    const now = Date.now()

    db.prepare(`
      INSERT INTO movies (id, userId, title, year, posterUrl, backdropUrl, overview, 
        magnetLink, infohash, tmdbId, status, addedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'added', ?)
    `).run(
      id,
      movie.userId,
      movie.title,
      movie.year,
      movie.posterUrl,
      movie.backdropUrl,
      movie.overview,
      movie.magnetLink,
      movie.infohash,
      movie.tmdbId,
      now
    )

    return { ...movie, id, addedAt: now, status: 'added' } as Movie
  },

  updateProgress(id: string, progress: number, status: string) {
    db.prepare('UPDATE movies SET progress = ?, status = ? WHERE id = ?')
      .run(progress, status, id)
  },

  updateFilePath(id: string, filePath: string) {
    db.prepare('UPDATE movies SET filePath = ?, status = "complete" WHERE id = ?')
      .run(filePath, id)
  },

  delete(id: string, userId: string) {
    db.prepare('DELETE FROM movies WHERE id = ? AND userId = ?').run(id, userId)
  },

  updateLastPlayed(id: string) {
    db.prepare('UPDATE movies SET lastPlayedAt = ? WHERE id = ?')
      .run(Date.now(), id)
  },
}
```

### TMDB Service

```ts
// src/lib/server/tmdb.ts
import { config } from '$lib/config'

interface TMDBMovie {
  id: number
  title: string
  release_date: string
  poster_path: string | null
  backdrop_path: string | null
  overview: string
}

interface TMDBSearchResult {
  results: TMDBMovie[]
}

export async function searchMovie(query: string, year?: number) {
  const params = new URLSearchParams({
    api_key: config.tmdb.apiKey,
    query,
  })

  if (year) params.set('year', String(year))

  const res = await fetch(`${config.tmdb.baseUrl}/search/movie?${params}`)
  const data: TMDBSearchResult = await res.json()

  return data.results.map((movie) => ({
    tmdbId: movie.id,
    title: movie.title,
    year: movie.release_date ? parseInt(movie.release_date.slice(0, 4)) : null,
    posterUrl: movie.poster_path
      ? `${config.tmdb.imageBaseUrl}${movie.poster_path}`
      : null,
    backdropUrl: movie.backdrop_path
      ? `${config.tmdb.imageBaseUrl}${movie.backdrop_path}`
      : null,
    overview: movie.overview,
  }))
}

export async function getMovieById(tmdbId: number) {
  const res = await fetch(
    `${config.tmdb.baseUrl}/movie/${tmdbId}?api_key=${config.tmdb.apiKey}`
  )
  const movie: TMDBMovie = await res.json()

  return {
    tmdbId: movie.id,
    title: movie.title,
    year: movie.release_date ? parseInt(movie.release_date.slice(0, 4)) : null,
    posterUrl: movie.poster_path
      ? `${config.tmdb.imageBaseUrl}${movie.poster_path}`
      : null,
    backdropUrl: movie.backdrop_path
      ? `${config.tmdb.imageBaseUrl}${movie.backdrop_path}`
      : null,
    overview: movie.overview,
  }
}
```

### Magnet Parser

```ts
// src/lib/server/magnet.ts
import parseTorrent from 'parse-torrent'
import ptt from 'parse-torrent-title'

export function parseMagnet(magnetLink: string) {
  const parsed = parseTorrent(magnetLink)
  const infohash = parsed.infoHash

  // Parse title from magnet name
  const name = parsed.name || ''
  const titleInfo = ptt.parse(name)

  return {
    infohash,
    name,
    title: titleInfo.title,
    year: titleInfo.year,
  }
}
```

### Server Torrent Handler (Self-Hosted Only)

```ts
// src/lib/server/torrent.ts
import WebTorrent from 'webtorrent-hybrid'
import { config } from '$lib/config'
import { movies } from './db'
import path from 'path'
import fs from 'fs/promises'

let client: WebTorrent.Instance | null = null

export function getTorrentClient() {
  if (!config.features.fileStorage) return null

  if (!client) {
    client = new WebTorrent()
  }
  return client
}

export async function startDownload(movieId: string, magnetLink: string) {
  const torrentClient = getTorrentClient()
  if (!torrentClient) return

  const downloadPath = config.paths.temp

  torrentClient.add(magnetLink, { path: downloadPath }, (torrent) => {
    torrent.on('download', () => {
      const progress = torrent.progress
      movies.updateProgress(movieId, progress, 'downloading')
    })

    torrent.on('done', async () => {
      // Find the video file
      const videoFile = torrent.files.find((f) =>
        /\.(mp4|mkv|avi|mov|webm)$/i.test(f.name)
      )

      if (videoFile) {
        const sourcePath = path.join(downloadPath, videoFile.path)
        const destDir = path.join(config.paths.library, movieId)
        const destPath = path.join(destDir, videoFile.name)

        await fs.mkdir(destDir, { recursive: true })
        await fs.rename(sourcePath, destPath)

        movies.updateFilePath(movieId, destPath)
      }

      // Clean up temp files
      torrent.destroy()
    })
  })
}
```

### API Routes

```ts
// src/routes/api/movies/+server.ts
import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { movies } from '$lib/server/db'
import { parseMagnet } from '$lib/server/magnet'
import { searchMovie } from '$lib/server/tmdb'
import { startDownload } from '$lib/server/torrent'
import { config } from '$lib/config'

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) throw error(401)

  const list = movies.list(locals.user.id)
  return json(list)
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401)

  const { magnetLink } = await request.json()

  if (!magnetLink || !magnetLink.startsWith('magnet:')) {
    throw error(400, 'Invalid magnet link')
  }

  // Parse magnet for metadata
  const { infohash, title, year } = parseMagnet(magnetLink)

  // Fetch metadata from TMDB
  let metadata = { title, year, posterUrl: null, backdropUrl: null, overview: null, tmdbId: null }

  if (title) {
    const results = await searchMovie(title, year)
    if (results.length > 0) {
      metadata = { ...metadata, ...results[0] }
    }
  }

  // Create movie record
  const movie = movies.create({
    userId: locals.user.id,
    title: metadata.title || 'Unknown',
    year: metadata.year,
    posterUrl: metadata.posterUrl,
    backdropUrl: metadata.backdropUrl,
    overview: metadata.overview,
    magnetLink,
    infohash,
    tmdbId: metadata.tmdbId,
  })

  // Start server-side download if file storage enabled
  if (config.features.fileStorage) {
    startDownload(movie.id, magnetLink)
  }

  return json(movie, { status: 201 })
}
```

```ts
// src/routes/api/movies/[id]/+server.ts
import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { movies } from '$lib/server/db'

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401)

  const movie = movies.get(params.id, locals.user.id)
  if (!movie) throw error(404)

  movies.updateLastPlayed(params.id)

  return json(movie)
}

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401)

  movies.delete(params.id, locals.user.id)

  return new Response(null, { status: 204 })
}
```

### Client Torrent Module

```ts
// src/lib/client/torrent.ts
import WebTorrent from 'webtorrent'

let client: WebTorrent.Instance | null = null

function getClient() {
  if (!client) {
    client = new WebTorrent()
  }
  return client
}

export interface StreamState {
  progress: number
  downloadSpeed: number
  peers: number
  ready: boolean
}

export function streamMagnet(
  magnetLink: string,
  videoElement: HTMLVideoElement,
  onStateChange: (state: StreamState) => void
): () => void {
  const torrentClient = getClient()

  const torrent = torrentClient.add(magnetLink)

  torrent.on('ready', () => {
    const videoFile = torrent.files.find((f) =>
      /\.(mp4|mkv|webm|mov)$/i.test(f.name)
    )

    if (videoFile) {
      videoFile.streamTo(videoElement)
    }
  })

  const interval = setInterval(() => {
    onStateChange({
      progress: torrent.progress,
      downloadSpeed: torrent.downloadSpeed,
      peers: torrent.numPeers,
      ready: torrent.ready,
    })
  }, 1000)

  // Cleanup function
  return () => {
    clearInterval(interval)
    torrent.destroy()
  }
}

export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${bytesPerSecond} B/s`
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
}
```

### Frontend Components

```svelte
<!-- src/routes/(app)/+page.svelte -->
<script lang="ts">
  import type { Movie } from '$lib/types'

  let movies: Movie[] = $state([])
  let loading = $state(true)
  let magnetInput = $state('')
  let adding = $state(false)

  async function loadMovies() {
    const res = await fetch('/api/movies')
    movies = await res.json()
    loading = false
  }

  async function addMagnet() {
    if (!magnetInput.trim()) return

    adding = true
    const res = await fetch('/api/movies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ magnetLink: magnetInput }),
    })

    if (res.ok) {
      const movie = await res.json()
      movies = [movie, ...movies]
      magnetInput = ''
    }
    adding = false
  }

  $effect(() => {
    loadMovies()
  })
</script>

<div class="min-h-screen bg-zinc-950 text-white">
  <header class="p-6 border-b border-zinc-800">
    <div class="max-w-6xl mx-auto flex items-center justify-between">
      <h1 class="text-2xl font-bold">Plank</h1>
      <div class="flex gap-2">
        <input
          type="text"
          bind:value={magnetInput}
          placeholder="Paste magnet link..."
          class="w-96 px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg"
        />
        <button
          onclick={addMagnet}
          disabled={adding}
          class="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
        >
          {adding ? 'Adding...' : 'Add'}
        </button>
      </div>
    </div>
  </header>

  <main class="max-w-6xl mx-auto p-6">
    {#if loading}
      <p class="text-zinc-400">Loading...</p>
    {:else if movies.length === 0}
      <p class="text-zinc-400">No movies yet. Add a magnet link to get started.</p>
    {:else}
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {#each movies as movie}
          <a href="/watch/{movie.id}" class="group">
            <div class="aspect-[2/3] bg-zinc-800 rounded-lg overflow-hidden">
              {#if movie.posterUrl}
                <img
                  src={movie.posterUrl}
                  alt={movie.title}
                  class="w-full h-full object-cover group-hover:scale-105 transition"
                />
              {:else}
                <div class="w-full h-full flex items-center justify-center text-zinc-600">
                  No Poster
                </div>
              {/if}
            </div>
            <p class="mt-2 text-sm truncate">{movie.title}</p>
            {#if movie.year}
              <p class="text-xs text-zinc-500">{movie.year}</p>
            {/if}
          </a>
        {/each}
      </div>
    {/if}
  </main>
</div>
```

```svelte
<!-- src/routes/(app)/watch/[id]/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores'
  import { onMount } from 'svelte'
  import { streamMagnet, formatSpeed, type StreamState } from '$lib/client/torrent'
  import type { Movie } from '$lib/types'

  let movie: Movie | null = $state(null)
  let videoElement: HTMLVideoElement
  let streamState: StreamState = $state({
    progress: 0,
    downloadSpeed: 0,
    peers: 0,
    ready: false,
  })
  let cleanup: (() => void) | null = null

  async function loadMovie() {
    const res = await fetch(`/api/movies/${page.params.id}`)
    movie = await res.json()

    if (movie && videoElement) {
      cleanup = streamMagnet(movie.magnetLink, videoElement, (state) => {
        streamState = state
      })
    }
  }

  onMount(() => {
    loadMovie()
    return () => cleanup?.()
  })
</script>

<div class="min-h-screen bg-black text-white">
  <div class="absolute top-4 left-4 z-10">
    <a href="/" class="text-zinc-400 hover:text-white">← Back</a>
  </div>

  <div class="flex flex-col items-center justify-center min-h-screen p-4">
    <video
      bind:this={videoElement}
      controls
      class="max-w-full max-h-[80vh] bg-black"
    ></video>

    <div class="mt-4 flex items-center gap-6 text-sm text-zinc-400">
      {#if !streamState.ready}
        <span>Connecting to peers...</span>
      {:else}
        <span>{(streamState.progress * 100).toFixed(1)}% downloaded</span>
        <span>{formatSpeed(streamState.downloadSpeed)}</span>
        <span>{streamState.peers} peers</span>
      {/if}
    </div>

    {#if movie}
      <div class="mt-6 max-w-2xl text-center">
        <h1 class="text-2xl font-bold">{movie.title}</h1>
        {#if movie.overview}
          <p class="mt-2 text-zinc-400">{movie.overview}</p>
        {/if}
      </div>
    {/if}
  </div>
</div>
```

### Types

```ts
// src/lib/types.ts
export interface Movie {
  id: string
  userId: string
  title: string
  year: number | null
  posterUrl: string | null
  backdropUrl: string | null
  overview: string | null
  magnetLink: string
  infohash: string
  filePath: string | null
  fileSize: number | null
  status: 'added' | 'downloading' | 'complete'
  progress: number
  tmdbId: number | null
  addedAt: number
  lastPlayedAt: number | null
}

export interface User {
  id: string
  email: string
  name: string | null
}
```

## Docker

### Dockerfile

```dockerfile
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

ENV NODE_ENV=production

EXPOSE 3000
EXPOSE 6881

CMD ["node", "build"]
```

### docker-compose.yml (SaaS)

```yaml
version: '3.8'

services:
  plank:
    build: .
    ports:
      - "3000:3000"
    environment:
      - ENABLE_FILE_STORAGE=false
      - DATABASE_URL=/app/db/plank.db
      - TMDB_API_KEY=${TMDB_API_KEY}
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
      - BETTER_AUTH_URL=${BETTER_AUTH_URL}
    volumes:
      - plank-db:/app/db

volumes:
  plank-db:
```

### docker-compose.selfhosted.yml

```yaml
version: '3.8'

services:
  plank:
    build: .
    ports:
      - "3000:3000"
      - "6881:6881"
      - "6881:6881/udp"
    environment:
      - ENABLE_FILE_STORAGE=true
      - DATABASE_URL=/app/db/plank.db
      - TMDB_API_KEY=${TMDB_API_KEY}
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
      - BETTER_AUTH_URL=${BETTER_AUTH_URL}
    volumes:
      - plank-db:/app/db
      - plank-data:/app/data
      - ${MEDIA_PATH:-./media}:/app/data/library  # Mount local media folder

volumes:
  plank-db:
  plank-data:
```

## Package Dependencies

```json
{
  "name": "plank",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "db:migrate": "node scripts/migrate.js"
  },
  "dependencies": {
    "@sveltejs/kit": "^2.0.0",
    "better-auth": "^1.0.0",
    "better-sqlite3": "^11.0.0",
    "parse-torrent": "^11.0.0",
    "parse-torrent-title": "^4.0.0",
    "webtorrent": "^2.0.0",
    "webtorrent-hybrid": "^5.0.0"
  },
  "devDependencies": {
    "@sveltejs/adapter-node": "^2.0.0",
    "@types/better-sqlite3": "^7.0.0",
    "svelte": "^5.0.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}
```

## Quick Start

**SaaS:**
```bash
cp .env.saas .env
docker-compose up -d
```

**Self-Hosted:**
```bash
cp .env.selfhosted .env
docker-compose -f docker-compose.selfhosted.yml up -d
```

## V2 Roadmap

- Hook into torrent indexers (1337x, RARBG mirrors) for browsing
- Network storage support (NFS, SMB)
- Cloud storage (S3, Google Drive)
- Subtitle fetching (OpenSubtitles API)
- Watch progress sync
- Multiple user profiles
- Transcoding for unsupported codecs
