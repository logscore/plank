# TV Show Support Implementation Plan

## Overview

This plan implements TV show support with multi-season/multi-episode selection, including:
- Context menu in the main library view for quick episode access
- Season/episode selector component in the movie details page
- Streaming individual episodes while the torrent downloads

## Architecture Summary

The implementation extends the existing movie-only system to support TV shows by:
1. Adding a `type` field to distinguish movies from TV shows
2. Creating `seasons` and `episodes` tables for episode metadata
3. Modifying torrent handling to track multiple video files per torrent
4. Adding TMDB TV API integration
5. Implementing episode-specific streaming with priority piece selection

---

## Phase 1: Database Schema Changes

### 1.1 Add `type` column to `movies` table

```sql
ALTER TABLE movies ADD COLUMN type TEXT DEFAULT 'movie' CHECK(type IN ('movie', 'tv'));
CREATE INDEX idx_movies_type ON movies(user_id, type);
```

### 1.2 Create `seasons` table

```sql
CREATE TABLE seasons (
  id TEXT PRIMARY KEY,
  show_id TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL,
  name TEXT,
  overview TEXT,
  poster_path TEXT,
  air_date TEXT,
  episode_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  UNIQUE(show_id, season_number)
);
CREATE INDEX idx_seasons_show ON seasons(show_id);
```

### 1.3 Create `episodes` table

```sql
CREATE TABLE episodes (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  title TEXT,
  overview TEXT,
  still_path TEXT,
  runtime INTEGER,
  file_index INTEGER,
  file_path TEXT,
  file_size INTEGER,
  downloaded_bytes INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'downloading', 'complete', 'error')),
  created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  UNIQUE(season_id, episode_number)
);
CREATE INDEX idx_episodes_season ON episodes(season_id);
CREATE INDEX idx_episodes_status ON episodes(status);
```

### 1.4 Drizzle Schema Updates

Add tables with relations to `src/lib/server/db/schema.ts`:
- `seasons` table with foreign key to movies
- `episodes` table with foreign key to seasons
- Relations: movies -> seasons -> episodes

---

## Phase 2: TypeScript Type Updates

### 2.1 Client Types (`src/lib/types.ts`)

```typescript
export type MediaType = 'movie' | 'tv';

export interface Movie {
  // ... existing fields ...
  type?: MediaType;
}

export interface Season {
  id: string;
  showId: string;
  seasonNumber: number;
  name: string | null;
  overview: string | null;
  posterPath: string | null;
  airDate: string | null;
  episodeCount: number | null;
  episodes?: Episode[];
}

export interface Episode {
  id: string;
  seasonId: string;
  episodeNumber: number;
  title: string | null;
  overview: string | null;
  stillPath: string | null;
  runtime: number | null;
  fileIndex: number | null;
  filePath: string | null;
  fileSize: number | null;
  downloadedBytes: number | null;
  status: 'pending' | 'downloading' | 'complete' | 'error';
}
```

---

## Phase 3: TMDB TV API Integration

### 3.1 New Functions (`src/lib/server/tmdb.ts`)

```typescript
export async function searchTvShow(query: string): Promise<TMDBMetadata[]> {
  // Search TMDB /search/tv endpoint
}

export async function getTvDetails(tmdbId: number): Promise<TMDBMetadata & { totalSeasons: number }> {
  // Fetch show details from TMDB /tv/{id}
}

export async function getSeasonDetails(tmdbId: number, seasonNumber: number): Promise<SeasonMetadata> {
  // Fetch season details from TMDB /tv/{id}/season/{number}
}
```

---

## Phase 4: Database Access Layer

### 4.1 New Methods (`src/lib/server/db/index.ts`)

```typescript
// Show operations
export function createShow(data: { ... }) { /* insert into movies with type='tv' */ }
export function listShows(userId: string): Movie[] { /* where type='tv' */ }

// Season operations
export function createSeason(data: { ... }) { /* insert into seasons */ }
export function getSeasons(showId: string): Season[] { /* with episode counts */ }

// Episode operations
export function createEpisode(data: { ... }) { /* insert into episodes */ }
export function getEpisodes(seasonId: string): Episode[] { /* ... */ }
export function updateEpisodeFile(id: string, fileIndex: number, filePath: string): void { /* ... */ }
```

---

## Phase 5: Enhanced Torrent Handling

### 5.1 Multi-File Torrent Support (`src/lib/server/torrent.ts`)

Current implementation selects single video file. For TV shows:

```typescript
interface ActiveDownload {
  movieId: string;
  torrent: Torrent;
  videoFiles: TorrentFile[];  // Changed from single file
  selectedFileIndex: number | null;
  episodeMapping: Map<number, number>; // episodeKey -> fileIndex
  progress: number;
  status: 'initializing' | 'downloading' | 'complete' | 'error';
  activeStreams: number;
  totalSize: number;
}

// Modified torrent.on('ready') handler
torrent.on('ready', () => {
  // Find all video files, sorted by size
  const videoFiles = torrent.files
    .filter(f => isSupportedFormat(f.name) && f.length >= MIN_VIDEO_SIZE)
    .sort((a, b) => b.length - a.length);

  // Parse filenames and map to episodes using parse-torrent-title
  const episodeMapping = new Map<number, number>();
  videoFiles.forEach((file, index) => {
    const parsed = ptt.parse(file.name);
    if (parsed.season && parsed.episode) {
      const episodeKey = parsed.season * 100 + parsed.episode;
      episodeMapping.set(episodeKey, index);
    }
  });

  download.videoFiles = videoFiles;
  download.episodeMapping = episodeMapping;
  download.totalSize = videoFiles.reduce((sum, f) => sum + f.length, 0);
  download.status = 'downloading';
});
```

### 5.2 Episode-Specific Streaming

```typescript
export async function getVideoStream(
  movieId: string,
  start?: number,
  end?: number,
  fileIndex?: number  // NEW: optional file index for multi-file torrents
): Promise<StreamInfo | null> {
  const download = activeDownloads.get(movieId);
  if (!download?.videoFiles) return null;

  const targetIndex = fileIndex ?? download.selectedFileIndex ?? 0;
  const videoFile = download.videoFiles[targetIndex];

  if (!videoFile) return null;

  // Select the file for priority downloading
  download.videoFiles.forEach((f, i) => {
    if (i === targetIndex) f.select();
    else f.deselect();
  });

  // ... rest of streaming logic
}
```

### 5.3 Priority Piece Selection for Streaming

```typescript
// When user selects an episode to watch
export async function selectEpisode(movieId: string, episodeNumber: number): Promise<void> {
  const download = activeDownloads.get(movieId);
  if (!download) return;

  const episodeKey = Math.floor(episodeNumber / 100) * 100 + (episodeNumber % 100);
  const fileIndex = download.episodeMapping.get(episodeKey);

  if (fileIndex !== undefined) {
    download.selectedFileIndex = fileIndex;
    const file = download.videoFiles[fileIndex];
    file.select(0, 0, true); // Priority to first pieces
  }
}
```

---

## Phase 6: API Endpoints

### 6.1 Show Management Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/shows` | List all TV shows |
| POST | `/api/shows` | Add new show (magnet link) |
| GET | `/api/shows/:id` | Get show with seasons |
| DELETE | `/api/shows/:id` | Delete show and all episodes |
| GET | `/api/shows/:id/seasons` | List seasons |
| GET | `/api/shows/:id/seasons/:num` | Get season with episodes |
| POST | `/api/shows/:id/episodes/:episodeId/stream` | Select episode for streaming |
| GET | `/api/shows/:id/stream` | Stream episode (with fileIndex param) |

---

## Phase 7: Frontend Components

### 7.1 Context Menu for Library View

**File:** `src/lib/components/MediaCard.svelte` (renamed from MovieCard)

Features:
- Right-click or list button opens cascading menu
- Shows seasons as top-level items
- Shows episodes when season expanded
- Click episode to play

### 7.2 Updated Library Page (`src/routes/(app)/+page.svelte`)

```svelte
<script lang="ts">
  import MediaCard from '$lib/components/MediaCard.svelte';

  let { data } = $props();
  let movies: Movie[] = $state([]);
  let showSeasons: Map<string, Season[]> = $state(new Map());

  async function loadLibrary() {
    const res = await fetch('/api/library');
    const result = await res.json();
    movies = result.items;
    showSeasons = new Map(result.seasons);
  }

  async function handleSelectEpisode(episode: Episode) {
    const res = await fetch(`/api/shows/${showId}/episodes/${episode.id}/stream`, {
      method: 'POST',
    });
    const result = await res.json();
    if (result.success) {
      window.location.href = result.streamUrl;
    }
  }
</script>

<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
  {#each movies as movie}
    <MediaCard
      {movie}
      seasons={showSeasons.get(movie.id) || []}
      onSelectEpisode={movie.type === 'tv' ? handleSelectEpisode : undefined}
    />
  {/each}
</div>
```

### 7.3 Show Details Page (`src/routes/(app)/show/[id]/+page.svelte`)

Reuse existing EpisodeSelector component with show data:
- Shows show hero with backdrop/poster
- Uses EpisodeSelector component for episode selection
- Navigates to watch page on episode selection

### 7.4 Updated EpisodeSelector (`src/lib/components/EpisodeSelector.svelte`)

Already exists with good implementation. Verify:
- Cascading dropdown works for seasons -> episodes
- Shows episode runtime and title
- Shows "Not available" for unwatched episodes

---

## Phase 8: Watch Page Updates

### 8.1 Support Episode-Specific Watching

Modify `src/routes/(app)/watch/[id]/+page.svelte`:
- Support `?episodeId=xxx` query param
- Load episode metadata when episodeId provided
- Use correct stream URL with fileIndex

---

## Phase 9: Migration Strategy

1. Run schema migrations (add `type` column, create tables)
2. Existing movies automatically have `type = 'movie'` (default)
3. No data loss for existing users

---

## Implementation Order

1. Schema & Types - Add tables, types, and DB helpers
2. TMDB TV Integration - Add TV search and season/episode fetching
3. Backend API - Show and episode endpoints
4. Enhanced Torrent - Multi-file support and episode selection
5. Streaming - Episode-specific streaming with priority selection
6. Media Card - Context menu for episode selection
7. Library Page - Integrate media cards, load shows
8. Show Details - Season/episode selector
9. Watch Page - Episode support

---

## Key Technical Decisions

### Torrent File Selection Strategy: Priority-Based Selection

- User selects episode → select that file with priority
- WebTorrent auto-selects sequential pieces for streaming
- User can switch episodes → deselect current, select new
- Background continues downloading remaining files

### TMDB ID Resolution

When adding a TV show via magnet:
1. Parse filename to extract show name
2. Search TMDB for show
3. Present results for user to select correct show
4. Or accept optional `tmdbId` parameter for direct add

---

## Files to Modify

### New Files
- `src/lib/components/MediaCard.svelte`
- `src/routes/(app)/show/[id]/+page.svelte`
- `src/routes/(app)/show/[id]/+page.server.ts`

### Modified Files
- `src/lib/types.ts` - Add TV types
- `src/lib/server/db/schema.ts` - Add seasons/episodes tables
- `src/lib/server/db/index.ts` - Add show/season/episode methods
- `src/lib/server/tmdb.ts` - Add TV API functions
- `src/lib/server/torrent.ts` - Multi-file torrent support
- `src/routes/(app)/+page.svelte` - Integrate media cards
- `src/routes/(app)/watch/[id]/+page.svelte` - Episode support

### API Endpoints to Add
- GET/POST `/api/shows`
- GET/DELETE `/api/shows/:id`
- GET `/api/shows/:id/seasons`
- GET `/api/shows/:id/seasons/:num`
- POST `/api/shows/:id/episodes/:episodeId/stream`
- GET `/api/shows/:id/stream`
