# Public Website Mode Implementation Plan

## Overview

Implement a "public website" mode that streams torrent data on the client instead of the server. This mode is designed to avoid saving or processing data on the server, making it suitable for public-facing deployments.

## Configuration

**Environment Variable:** `PUBLIC_WEBSITE_MODE=true`

## Architecture

### Public Website Mode (`PUBLIC_WEBSITE_MODE=true`)
- **Server:** Fetches TMDB metadata only, serves images from TMDB URLs directly, no file system storage
- **Client:** Stores metadata in IndexedDB, handles WebTorrent downloads and streaming
- **Authentication:** Required (user must be logged in)
- **Data isolation:** Users only see their own client-side stored movies

### Normal Mode (`PUBLIC_WEBSITE_MODE=false`)
- **Server:** Handles everything - TMDB metadata, file storage, torrent downloads, streaming
- **Client:** Fetches data from server APIs
- Current behavior, unchanged

---

## Implementation Phases

### Phase 1: Environment & Configuration

#### 1.1 Update `.env.example`
Add:
```
PUBLIC_WEBSITE_MODE=false
```

#### 1.2 Update `src/lib/config.ts`
```typescript
export const config = {
  publicWebsiteMode: env.PUBLIC_WEBSITE_MODE === 'true',
  // ... existing config
}
```

---

### Phase 2: Server-Side Modifications

#### 2.1 Movie Addition API (`src/routes/api/movies/+server.ts`)

**POST Handler Changes:**

```typescript
export const POST: RequestHandler = async ({ request, locals }) => {
  // ... existing auth check ...
  
  const { magnetLink } = await request.json();
  const { infohash, title, year } = parseMagnet(magnetLink);
  
  // Fetch TMDB metadata (keep this in both modes!)
  const metadata = await fetchTMDBMetadata(title, year);
  
  if (config.publicWebsiteMode) {
    // Public mode: Return metadata without saving to DB
    return json({
      id: generateId(), // Generate client-side usable ID
      ...metadata,
      magnetLink,
      infohash,
      userId: locals.user.id,
      posterUrl: metadata.posterUrl,    // Keep TMDB URL (don't save locally)
      backdropUrl: metadata.backdropUrl, // Keep TMDB URL
      addedAt: new Date(),
      status: 'added',
      progress: 0,
      filePath: null,
      fileSize: null,
    }, { status: 200 });
  }
  
  // Normal mode: Save to DB and start download
  const movie = movies.create({...});
  startDownload(movie.id, magnetLink);
  return json(movie, { status: 201 });
}
```

**Key Differences in Public Mode:**
- Skip database creation
- Skip `startDownload()` call
- Skip local image saving
- Return metadata with TMDB URLs directly

#### 2.2 Movie List API (`src/routes/api/movies/+server.ts`)

**GET Handler Changes:**

```typescript
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  if (config.publicWebsiteMode) {
    return json([]); // Client will use IndexedDB
  }
  
  // Normal mode: Return from database
  const list = movies.list(locals.user.id);
  return json(list);
}
```

#### 2.3 Movie Details API (`src/routes/api/movies/[id]/+server.ts`)

**GET Handler Changes:**

```typescript
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  if (config.publicWebsiteMode) {
    throw error(404, 'Movie not found'); // Client uses IndexedDB
  }
  
  // Normal mode: Return from database
  const movie = movies.get(params.id, locals.user.id);
  if (!movie) {
    throw error(404, 'Movie not found');
  }
  return json(movie);
}
```

**DELETE Handler Changes:**

```typescript
export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  if (config.publicWebsiteMode) {
    return new Response(null, { status: 204 }); // Client handles deletion
  }
  
  // Normal mode: Delete from DB and files
  await cancelDownload(params.id);
  await deleteMovieFiles(params.id);
  movies.delete(params.id, locals.user.id);
  return new Response(null, { status: 204 });
}
```

#### 2.4 Streaming API (`src/routes/api/movies/[id]/stream/+server.ts`)

**GET Handler Changes:**

```typescript
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  if (config.publicWebsiteMode) {
    throw error(501, 'Streaming is handled client-side in public mode');
  }
  
  // Normal mode: Stream from server
  // ... existing streaming logic ...
}
```

#### 2.5 Progress APIs

**`src/routes/api/movies/[id]/progress/+server.ts`:**

```typescript
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  if (config.publicWebsiteMode) {
    return json({
      status: 'client-managed',
      progress: 0,
      downloadSpeed: 0,
      uploadSpeed: 0,
      peers: 0,
      isActive: false,
      filePath: null,
    });
  }
  
  // Normal mode: Return server-side progress
  // ... existing logic ...
}
```

**`src/routes/api/movies/[id]/progress/stream/+server.ts`:**

```typescript
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  if (config.publicWebsiteMode) {
    // Return empty SSE stream that closes immediately
    return new Response('', { status: 204 });
  }
  
  // Normal mode: Return SSE stream
  // ... existing logic ...
}
```

---

### Phase 3: Client-Side Storage (IndexedDB)

#### 3.1 Install Dependencies

```bash
npm install dexie
```

#### 3.2 Create IndexedDB Module (`src/lib/client/storage.ts`)

```typescript
import Dexie, { type Table } from 'dexie';
import type { Movie } from '$lib/types';

export class MovieDatabase extends Dexie {
  movies!: Table<Movie, string>;
  
  constructor() {
    super('PlankMoviesDB');
    this.version(1).stores({
      movies: 'id, userId, title, year, infohash, status, addedAt, lastPlayedAt, tmdbId'
    });
  }
}

export const movieDB = new MovieDatabase();

export const movieStorage = {
  async add(movie: Movie): Promise<Movie> {
    await movieDB.movies.add(movie);
    return movie;
  },
  
  async getAll(userId: string): Promise<Movie[]> {
    return movieDB.movies
      .where('userId')
      .equals(userId)
      .reverse()
      .sortBy('addedAt');
  },
  
  async get(id: string, userId: string): Promise<Movie | undefined> {
    const movie = await movieDB.movies.get(id);
    return movie?.userId === userId ? movie : undefined;
  },
  
  async getByInfohash(infohash: string, userId: string): Promise<Movie | undefined> {
    return movieDB.movies
      .where({ infohash, userId })
      .first();
  },
  
  async delete(id: string, userId: string): Promise<void> {
    const movie = await movieDB.movies.get(id);
    if (movie?.userId === userId) {
      await movieDB.movies.delete(id);
    }
  },
  
  async updateProgress(id: string, progress: number, status: Movie['status']): Promise<void> {
    await movieDB.movies.update(id, { progress, status });
  },
  
  async updateLastPlayed(id: string): Promise<void> {
    await movieDB.movies.update(id, { lastPlayedAt: new Date() });
  },
  
  async updateMetadata(id: string, metadata: Partial<Movie>): Promise<void> {
    await movieDB.movies.update(id, metadata);
  },
  
  async updateFilePath(id: string, filePath: string, fileSize?: number): Promise<void> {
    await movieDB.movies.update(id, { filePath, fileSize });
  }
};
```

---

### Phase 4: Client-Side Torrent Management

#### 4.1 Create Client Torrent Module (`src/lib/client/torrent.ts`)

```typescript
import type { Movie } from '$lib/types';
import { movieStorage } from './storage';

// WebTorrent types (simplified for browser)
interface TorrentFile {
  name: string;
  length: number;
  progress: number;
  getBlobURL(callback: (err: Error | null, url?: string) => void): void;
  createReadStream(opts?: { start?: number; end?: number }): ReadableStream;
}

interface Torrent {
  files: TorrentFile[];
  infoHash: string;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  numPeers: number;
  done: boolean;
  ready: boolean;
  destroy(opts?: { destroyStore?: boolean }, callback?: () => void): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
}

interface WebTorrentClient {
  add(magnetURI: string, callback?: (torrent: Torrent) => void): Torrent;
  remove(torrentId: string, opts?: { destroyStore?: boolean }, callback?: () => void): void;
  get(torrentId: string): Torrent | null;
  destroy(callback?: () => void): void;
}

interface ClientDownload {
  movieId: string;
  torrent: Torrent | null;
  videoFile: TorrentFile | null;
  status: 'initializing' | 'downloading' | 'complete' | 'error';
  progress: number;
  error?: string;
  blobUrl?: string;
}

// Store active downloads
const activeDownloads = new Map<string, ClientDownload>();

// Singleton WebTorrent client
let client: WebTorrentClient | null = null;

// Supported video formats
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v'];
const MIN_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

async function getClient(): Promise<WebTorrentClient> {
  if (!client) {
    const WebTorrent = await import('webtorrent');
    client = new WebTorrent.default() as unknown as WebTorrentClient;
  }
  return client;
}

function findVideoFile(files: TorrentFile[]): TorrentFile | null {
  const videoFiles = files
    .filter((f) => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      return VIDEO_EXTENSIONS.includes(ext) && f.length >= MIN_VIDEO_SIZE;
    })
    .sort((a, b) => b.length - a.length);
  
  return videoFiles[0] || null;
}

export async function startClientDownload(movieId: string, magnetLink: string): Promise<void> {
  if (activeDownloads.has(movieId)) {
    // console.log(`[Client] Download already active for ${movieId}`);
    return;
  }

  const download: ClientDownload = {
    movieId,
    torrent: null,
    videoFile: null,
    status: 'initializing',
    progress: 0,
  };
  
  activeDownloads.set(movieId, download);

  try {
    const torrentClient = await getClient();
    
    const torrent = torrentClient.add(magnetLink, (t) => {
      // console.log(`[Client] Torrent ready: ${t.infoHash}`);
      
      const videoFile = findVideoFile(t.files);
      if (!videoFile) {
        download.status = 'error';
        download.error = 'No video file found in torrent';
        movieStorage.updateProgress(movieId, 0, 'error');
        return;
      }
      
      download.torrent = t;
      download.videoFile = videoFile;
      download.status = 'downloading';
      
      // Update progress periodically
      t.on('download', () => {
        download.progress = videoFile.progress;
        movieStorage.updateProgress(movieId, download.progress, 'downloading');
      });
      
      t.on('done', () => {
        download.status = 'complete';
        download.progress = 1;
        movieStorage.updateProgress(movieId, 1, 'complete');
        // console.log(`[Client] Download complete: ${movieId}`);
      });
    });
    
    torrent.on('error', (err: Error) => {
      console.error(`[Client] Torrent error for ${movieId}:`, err);
      download.status = 'error';
      download.error = err.message;
      movieStorage.updateProgress(movieId, 0, 'error');
    });
    
  } catch (e) {
    console.error(`[Client] Failed to start download for ${movieId}:`, e);
    download.status = 'error';
    download.error = e instanceof Error ? e.message : 'Unknown error';
    movieStorage.updateProgress(movieId, 0, 'error');
  }
}

export function getClientDownloadStatus(movieId: string): {
  status: 'idle' | 'initializing' | 'downloading' | 'complete' | 'error';
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  peers: number;
  error?: string;
} | null {
  const download = activeDownloads.get(movieId);
  
  if (!download) {
    return null;
  }
  
  return {
    status: download.status,
    progress: download.progress,
    downloadSpeed: download.torrent?.downloadSpeed || 0,
    uploadSpeed: download.torrent?.uploadSpeed || 0,
    peers: download.torrent?.numPeers || 0,
    error: download.error,
  };
}

export function isClientDownloadActive(movieId: string): boolean {
  return activeDownloads.has(movieId);
}

export async function getClientVideoUrl(movieId: string): Promise<string | null> {
  const download = activeDownloads.get(movieId);
  
  if (!download?.videoFile) {
    return null;
  }
  
  // Return cached blob URL if available
  if (download.blobUrl) {
    return download.blobUrl;
  }
  
  // Get blob URL from WebTorrent
  return new Promise((resolve) => {
    download.videoFile!.getBlobURL((err, url) => {
      if (err || !url) {
        console.error(`[Client] Failed to get blob URL:`, err);
        resolve(null);
        return;
      }
      download.blobUrl = url;
      resolve(url);
    });
  });
}

export async function cancelClientDownload(movieId: string): Promise<void> {
  const download = activeDownloads.get(movieId);
  
  if (!download) {
    return;
  }
  
  // Revoke blob URL if exists
  if (download.blobUrl) {
    URL.revokeObjectURL(download.blobUrl);
  }
  
  // Destroy torrent
  if (download.torrent) {
    download.torrent.destroy({ destroyStore: true });
  }
  
  activeDownloads.delete(movieId);
  // console.log(`[Client] Download cancelled: ${movieId}`);
}

export async function shutdownClientTorrents(): Promise<void> {
  for (const [movieId, download] of activeDownloads) {
    if (download.blobUrl) {
      URL.revokeObjectURL(download.blobUrl);
    }
    if (download.torrent) {
      download.torrent.destroy({ destroyStore: true });
    }
  }
  
  activeDownloads.clear();
  
  if (client) {
    client.destroy();
    client = null;
  }
}
```

---

### Phase 5: Frontend Updates

#### 5.1 Update Home Page (`src/routes/(app)/+page.svelte`)

Add logic to fetch from IndexedDB when server returns empty array:

```typescript
import { movieStorage } from '$lib/client/storage';

let movies: Movie[] = $state([]);

async function loadMovies() {
  const res = await fetch('/api/movies');
  const apiMovies = await res.json();
  
  if (apiMovies.length === 0 && locals.user) {
    // Public mode or empty library: use IndexedDB
    movies = await movieStorage.getAll(locals.user.id);
  } else {
    // Normal mode: use API response
    movies = apiMovies;
  }
}
```

#### 5.2 Update Add Movie Flow

Modify the add movie handler to store in IndexedDB and start client download:

```typescript
import { movieStorage } from '$lib/client/storage';
import { startClientDownload } from '$lib/client/torrent';

async function addMagnet(magnetLink: string) {
  const res = await fetch('/api/movies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ magnetLink }),
  });
  
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.message || 'Failed to add movie');
  }
  
  const movie = await res.json();
  
  // Check if this is public mode (status code 200 vs 201)
  if (res.status === 200) {
    // Public mode: Store in IndexedDB and start client download
    await movieStorage.add(movie);
    await startClientDownload(movie.id, movie.magnetLink);
  }
  
  return movie;
}
```

#### 5.3 Update Movie Details Page (`src/routes/(app)/movie/[id]/+page.svelte`)

Update to load from IndexedDB when server returns 404:

```typescript
import { movieStorage } from '$lib/client/storage';
import { getClientDownloadStatus, cancelClientDownload } from '$lib/client/torrent';

async function loadMovie() {
  try {
    const res = await fetch(`/api/movies/${id}`);
    if (res.ok) {
      movie = await res.json();
      return;
    }
  } catch (e) {
    // API failed, try IndexedDB
  }
  
  // Public mode: use IndexedDB
  movie = await movieStorage.get(id, userId);
}

async function handleDelete() {
  // Cancel client-side download first
  await cancelClientDownload(id);
  
  // Delete from IndexedDB
  await movieStorage.delete(id, userId);
  
  // Call server delete (no-op in public mode)
  await fetch(`/api/movies/${id}`, { method: 'DELETE' });
  
  goto('/');
}

// Use client-side progress in public mode
function getProgress() {
  const clientStatus = getClientDownloadStatus(id);
  if (clientStatus) {
    return clientStatus;
  }
  // Fallback to server SSE in normal mode
  return serverProgress;
}
```

#### 5.4 Update Watch Page (`src/routes/(app)/watch/[id]/+page.svelte`)

Update to use client-side streaming:

```typescript
import { movieStorage } from '$lib/client/storage';
import { 
  startClientDownload, 
  getClientVideoUrl, 
  getClientDownloadStatus,
  isClientDownloadActive 
} from '$lib/client/torrent';

let videoSrc: string = $state('');
let isPublicMode = $state(false);

async function loadVideo() {
  // Try to get movie from IndexedDB first
  const localMovie = await movieStorage.get(id, userId);
  
  if (localMovie) {
    isPublicMode = true;
    movie = localMovie;
    
    // Start download if not already active
    if (!isClientDownloadActive(id)) {
      await startClientDownload(id, movie.magnetLink);
    }
    
    // Wait for video to be ready and get URL
    await waitForClientVideoReady();
  } else {
    // Normal mode: use server streaming
    isPublicMode = false;
    videoSrc = `/api/movies/${id}/stream`;
  }
}

async function waitForClientVideoReady() {
  const checkInterval = setInterval(async () => {
    const status = getClientDownloadStatus(id);
    
    if (status && (status.progress >= 0.05 || status.status === 'complete')) {
      clearInterval(checkInterval);
      const url = await getClientVideoUrl(id);
      if (url) {
        videoSrc = url;
      }
    }
  }, 500);
}

function getVideoSrc(): string {
  if (isPublicMode) {
    return videoSrc; // Blob URL from client torrent
  }
  return movie ? `/api/movies/${movie.id}/stream` : '';
}
```

---

### Phase 6: Page Server Load Updates

#### 6.1 Update Movie Page Server (`src/routes/(app)/movie/[id]/+page.server.ts`)

```typescript
import { error } from '@sveltejs/kit';
import { config } from '$lib/config';
import { movies } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  if (config.publicWebsiteMode) {
    // In public mode, return minimal data - client will load from IndexedDB
    return { 
      movie: null,
      publicMode: true 
    };
  }

  const movie = movies.get(params.id, locals.user.id);
  if (!movie) {
    throw error(404, 'Movie not found');
  }

  return { movie, publicMode: false };
};
```

---

## Data Flow Diagrams

### Public Website Mode - Add Movie

```
1. User enters magnet link
2. POST /api/movies { magnetLink }
   ↓
3. Server: Parse magnet, extract infohash, title, year
   ↓
4. Server: Fetch TMDB metadata (title, poster, backdrop, etc.)
   ↓
5. Server: Return JSON with metadata + TMDB image URLs (status 200)
   ↓
6. Client: Store movie in IndexedDB
   ↓
7. Client: Start WebTorrent download
   ↓
8. Client: Update progress in IndexedDB periodically
```

### Public Website Mode - Watch Movie

```
1. User navigates to /watch/[id]
   ↓
2. Client: Load movie from IndexedDB
   ↓
3. Client: Start/resume WebTorrent download if needed
   ↓
4. Client: Wait for 5%+ downloaded
   ↓
5. Client: Get blob URL from WebTorrent
   ↓
6. Client: Set video src to blob URL
   ↓
7. Video streams from browser torrent
```

### Normal Mode - Add Movie (Unchanged)

```
1. User enters magnet link
2. POST /api/movies { magnetLink }
   ↓
3. Server: Parse magnet, fetch TMDB, save to DB
   ↓
4. Server: Download images locally
   ↓
5. Server: Start server-side WebTorrent download
   ↓
6. Server: Return movie with local image paths (status 201)
```

### Normal Mode - Watch Movie (Unchanged)

```
1. User navigates to /watch/[id]
   ↓
2. GET /api/movies/[id]/stream
   ↓
3. Server: Stream video file to client
```

---

## Key Design Decisions

### Why Hide Public Mode Flag from Client?
- Avoid exposing internal architecture
- Maintain consistent API surface
- Security through obscurity (minimal but non-zero benefit)
- Simplify client logic (detect behavior via response codes, not flags)

### Why Server Still Fetches TMDB?
- Keep API key secure (not exposed to client)
- Maintain consistent metadata quality
- Reduce client-side complexity
- Centralize metadata logic

### Why Use IndexedDB on Client?
- Native browser storage (no additional server deps)
- Large storage capacity (usually 50%+ of disk)
- Works offline
- Supports complex queries with indexes
- Perfect fit for movie metadata storage
- Aligns with torrent-browse-design.md architecture

### Why Dexie.js?
- Promise-based API (similar to server code style)
- TypeScript support
- Small bundle size
- Easy migration/versioning
- Already planned for torrent browse feature

---

## Files to Create/Modify

### New Files
- `src/lib/client/storage.ts` - IndexedDB operations
- `src/lib/client/torrent.ts` - Client-side WebTorrent management

### Modified Files
- `.env.example` - Add `PUBLIC_WEBSITE_MODE`
- `src/lib/config.ts` - Add `publicWebsiteMode` flag
- `src/routes/api/movies/+server.ts` - Conditional logic for public mode
- `src/routes/api/movies/[id]/+server.ts` - Conditional logic for public mode
- `src/routes/api/movies/[id]/stream/+server.ts` - Return 501 in public mode
- `src/routes/api/movies/[id]/progress/+server.ts` - Return client-managed response
- `src/routes/api/movies/[id]/progress/stream/+server.ts` - Return empty SSE
- `src/routes/(app)/+page.svelte` - Load from IndexedDB when API returns empty
- `src/routes/(app)/movie/[id]/+page.svelte` - Client-side movie loading & progress
- `src/routes/(app)/movie/[id]/+page.server.ts` - Return null in public mode
- `src/routes/(app)/watch/[id]/+page.svelte` - Client-side streaming

---

## Implementation Timeline

### Phase 1-2: Environment & Server (1-2 hours)
- Add environment variable
- Update config
- Modify all server endpoints

### Phase 3: IndexedDB Setup (30 minutes)
- Install dexie
- Create storage module

### Phase 4: Client Torrent (1-2 hours)
- Create torrent module
- Handle download lifecycle
- Implement streaming

### Phase 5-6: Frontend Updates (2-3 hours)
- Update all pages
- Integrate IndexedDB
- Integrate client torrent

### Testing & Refinement (1-2 hours)
- Test both modes end-to-end
- Fix edge cases
- Performance optimization

**Total Estimated Time: 6-10 hours**

---

## Testing Checklist

- [ ] Movie addition works in public mode
- [ ] Movie addition works in normal mode
- [ ] Movie list loads from IndexedDB in public mode
- [ ] Movie list loads from server in normal mode
- [ ] Movie details load from IndexedDB in public mode
- [ ] Movie details load from server in normal mode
- [ ] Streaming works from client WebTorrent in public mode
- [ ] Streaming works from server in normal mode
- [ ] Delete removes from IndexedDB in public mode
- [ ] Delete removes from server in normal mode
- [ ] Progress tracking works client-side in public mode
- [ ] Progress tracking works via SSE in normal mode
- [ ] Authentication still required in public mode
- [ ] TMDB images load from URLs in public mode
- [ ] TMDB images load from local storage in normal mode
