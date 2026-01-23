# TV Show Support Implementation Plan

## Overview

This plan implements TV show support with multi-season/multi-episode selection, including:
- Unified `/api/media` endpoints (renamed from `/api/movies`)
- Separate Movies/TV Shows tabs in library view
- Context menu for quick episode access from library cards
- Season/episode selector component in the show details page
- Streaming individual episodes while the torrent downloads
- Manual episode reordering when auto-mapping fails
- Auto-detect media type with manual TMDB override

## Architecture Summary

The implementation extends the existing movie-only system to support TV shows by:
1. Renaming `movies` table to `media` with a `type` field to distinguish movies from TV shows
2. Creating `seasons` and `episodes` tables for episode metadata
3. Modifying torrent handling to track multiple video files per torrent
4. Adding TMDB TV API integration with auto-detect and manual override
5. Implementing episode-specific streaming with priority piece selection
6. Adding episode reordering UI for when auto-mapping fails

## User Decisions

| Decision | Choice |
|----------|--------|
| API Structure | Unified `/api/media` with `?type=` query param |
| Library UI | Separate Movies/TV Shows tabs |
| Schema Naming | Rename `movies` table to `media` |
| Add Flow UX | Auto-detect with manual TMDB override |
| Mapping Fallback | Auto-number files sequentially |
| Episode Reordering | Yes, add drag-and-drop UI |
| Watch History | Skip for now (future feature) |

---

## Phase 1: Database Schema Changes

### 1.1 Migration: Rename `movies` to `media` and add type column

```sql
-- Rename table
ALTER TABLE movies RENAME TO media;

-- Add type column with default for existing records
ALTER TABLE media ADD COLUMN type TEXT DEFAULT 'movie' CHECK(type IN ('movie', 'tv'));

-- Create new index for type filtering
CREATE INDEX idx_media_type ON media(user_id, type);
```

### 1.2 Create `seasons` table

```sql
CREATE TABLE seasons (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL,
  name TEXT,
  overview TEXT,
  poster_path TEXT,
  air_date TEXT,
  episode_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  UNIQUE(media_id, season_number)
);
CREATE INDEX idx_seasons_media ON seasons(media_id);
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
  air_date TEXT,
  file_index INTEGER,
  file_path TEXT,
  file_size INTEGER,
  downloaded_bytes INTEGER DEFAULT 0,
  display_order INTEGER NOT NULL,  -- For manual reordering
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'downloading', 'complete', 'error')),
  created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  UNIQUE(season_id, episode_number)
);
CREATE INDEX idx_episodes_season ON episodes(season_id);
CREATE INDEX idx_episodes_status ON episodes(status);
CREATE INDEX idx_episodes_display_order ON episodes(season_id, display_order);
```

### 1.4 Drizzle Schema Updates

Update `src/lib/server/db/schema.ts`:

```typescript
import { relations, sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Rename movies to media
export const media = sqliteTable(
  'media',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['movie', 'tv'] }).default('movie').notNull(),
    title: text('title').notNull(),
    year: integer('year'),
    posterUrl: text('poster_url'),
    backdropUrl: text('backdrop_url'),
    overview: text('overview'),
    magnetLink: text('magnet_link').notNull(),
    infohash: text('infohash').notNull(),
    filePath: text('file_path'),
    fileSize: integer('file_size'),
    status: text('status', { enum: ['added', 'downloading', 'complete', 'error'] }).default('added'),
    progress: real('progress').default(0),
    tmdbId: integer('tmdb_id'),
    runtime: integer('runtime'),
    genres: text('genres'),
    originalLanguage: text('original_language'),
    certification: text('certification'),
    totalSeasons: integer('total_seasons'),  // TV shows only
    addedAt: integer('added_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    lastPlayedAt: integer('last_played_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('media_user_infohash_unique').on(table.userId, table.infohash),
    index('idx_media_user').on(table.userId),
    index('idx_media_status').on(table.status),
    index('idx_media_type').on(table.userId, table.type),
  ]
);

export const seasons = sqliteTable(
  'seasons',
  {
    id: text('id').primaryKey(),
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    seasonNumber: integer('season_number').notNull(),
    name: text('name'),
    overview: text('overview'),
    posterPath: text('poster_path'),
    airDate: text('air_date'),
    episodeCount: integer('episode_count').default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    uniqueIndex('seasons_media_number_unique').on(table.mediaId, table.seasonNumber),
    index('idx_seasons_media').on(table.mediaId),
  ]
);

export const episodes = sqliteTable(
  'episodes',
  {
    id: text('id').primaryKey(),
    seasonId: text('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    episodeNumber: integer('episode_number').notNull(),
    title: text('title'),
    overview: text('overview'),
    stillPath: text('still_path'),
    runtime: integer('runtime'),
    airDate: text('air_date'),
    fileIndex: integer('file_index'),
    filePath: text('file_path'),
    fileSize: integer('file_size'),
    downloadedBytes: integer('downloaded_bytes').default(0),
    displayOrder: integer('display_order').notNull(),
    status: text('status', { enum: ['pending', 'downloading', 'complete', 'error'] }).default('pending'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    uniqueIndex('episodes_season_number_unique').on(table.seasonId, table.episodeNumber),
    index('idx_episodes_season').on(table.seasonId),
    index('idx_episodes_status').on(table.status),
    index('idx_episodes_display_order').on(table.seasonId, table.displayOrder),
  ]
);

// Relations
export const mediaRelations = relations(media, ({ one, many }) => ({
  user: one(user, {
    fields: [media.userId],
    references: [user.id],
  }),
  seasons: many(seasons),
}));

export const seasonsRelations = relations(seasons, ({ one, many }) => ({
  media: one(media, {
    fields: [seasons.mediaId],
    references: [media.id],
  }),
  episodes: many(episodes),
}));

export const episodesRelations = relations(episodes, ({ one }) => ({
  season: one(seasons, {
    fields: [episodes.seasonId],
    references: [seasons.id],
  }),
}));

// Type exports
export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
export type Episode = typeof episodes.$inferSelect;
export type NewEpisode = typeof episodes.$inferInsert;
```

---

## Phase 2: TypeScript Type Updates

### 2.1 Client Types (`src/lib/types.ts`)

```typescript
// Client-safe types (these match the Drizzle schema but don't import server modules)

export type MediaType = 'movie' | 'tv';

export interface Media {
  id: string;
  userId: string;
  type: MediaType;
  title: string;
  year: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string | null;
  magnetLink: string;
  infohash: string;
  filePath: string | null;
  fileSize: number | null;
  status: 'added' | 'downloading' | 'complete' | 'error' | null;
  progress: number | null;
  tmdbId: number | null;
  runtime: number | null;
  genres: string | null;
  originalLanguage: string | null;
  certification: string | null;
  totalSeasons: number | null;  // TV shows only
  addedAt: Date;
  lastPlayedAt: Date | null;
}

// Alias for backward compatibility during migration
export type Movie = Media;

export interface Season {
  id: string;
  mediaId: string;
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
  airDate: string | null;
  fileIndex: number | null;
  filePath: string | null;
  fileSize: number | null;
  downloadedBytes: number | null;
  displayOrder: number;
  status: 'pending' | 'downloading' | 'complete' | 'error';
}

export interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image: string | null;
}

// API response types
export interface MediaWithSeasons extends Media {
  seasons: Season[];
}

export interface SeasonWithEpisodes extends Season {
  episodes: Episode[];
}
```

---

## Phase 3: TMDB TV API Integration

### 3.1 New Functions (`src/lib/server/tmdb.ts`)

```typescript
// TV Show search
export async function searchTVShow(query: string, year?: number): Promise<TMDBMetadata[]> {
  const params = new URLSearchParams({
    api_key: config.tmdb.apiKey,
    query,
  });

  if (year) params.set('first_air_date_year', String(year));

  const res = await fetch(`${config.tmdb.baseUrl}/search/tv?${params}`);
  const data = await res.json();

  return data.results.map((show: TMDBTVShow) => ({
    tmdbId: show.id,
    title: show.name,
    year: show.first_air_date ? parseInt(show.first_air_date.slice(0, 4)) : null,
    posterUrl: show.poster_path ? `${config.tmdb.imageBaseUrl}${show.poster_path}` : null,
    backdropUrl: show.backdrop_path ? `${config.tmdb.imageBaseUrl}${show.backdrop_path}` : null,
    overview: show.overview,
    totalSeasons: show.number_of_seasons,
  }));
}

// Get TV show details
export async function getTVDetails(tmdbId: number): Promise<TMDBMetadata & { totalSeasons: number }> {
  const res = await fetch(
    `${config.tmdb.baseUrl}/tv/${tmdbId}?api_key=${config.tmdb.apiKey}`
  );
  const show = await res.json();

  return {
    tmdbId: show.id,
    title: show.name,
    year: show.first_air_date ? parseInt(show.first_air_date.slice(0, 4)) : null,
    posterUrl: show.poster_path ? `${config.tmdb.imageBaseUrl}${show.poster_path}` : null,
    backdropUrl: show.backdrop_path ? `${config.tmdb.imageBaseUrl}${show.backdrop_path}` : null,
    overview: show.overview,
    totalSeasons: show.number_of_seasons,
    runtime: show.episode_run_time?.[0] || null,
    genres: show.genres?.map((g: { name: string }) => g.name).join(', ') || null,
    originalLanguage: show.original_language || null,
  };
}

// Get season details with episodes
export async function getSeasonDetails(
  tmdbId: number,
  seasonNumber: number
): Promise<SeasonMetadata> {
  const res = await fetch(
    `${config.tmdb.baseUrl}/tv/${tmdbId}/season/${seasonNumber}?api_key=${config.tmdb.apiKey}`
  );
  const season = await res.json();

  return {
    seasonNumber: season.season_number,
    name: season.name,
    overview: season.overview,
    posterPath: season.poster_path
      ? `${config.tmdb.imageBaseUrl}${season.poster_path}`
      : null,
    airDate: season.air_date,
    episodeCount: season.episodes?.length || 0,
    episodes: season.episodes?.map((ep: TMDBEpisode) => ({
      episodeNumber: ep.episode_number,
      title: ep.name,
      overview: ep.overview,
      stillPath: ep.still_path
        ? `${config.tmdb.imageBaseUrl}${ep.still_path}`
        : null,
      runtime: ep.runtime,
      airDate: ep.air_date,
    })) || [],
  };
}

// Detect if filename looks like a TV show
export function isTVShowFilename(title: string): boolean {
  // Common patterns: S01E01, 1x01, Season 1, Episode 1, etc.
  const tvPatterns = [
    /S\d{1,2}E\d{1,2}/i,           // S01E01
    /\d{1,2}x\d{1,2}/i,            // 1x01
    /Season\s*\d+/i,               // Season 1
    /Episode\s*\d+/i,              // Episode 1
    /E\d{2,}/i,                    // E01
    /\[\d{1,2}(?:v\d)?\]/,         // [01] or [01v2]
    /Complete\s*Series/i,          // Complete Series
    /Series\s*\d+/i,               // Series 1
  ];

  return tvPatterns.some(pattern => pattern.test(title));
}

// Types
interface TMDBTVShow {
  id: number;
  name: string;
  first_air_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  number_of_seasons: number;
}

interface TMDBEpisode {
  episode_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  runtime: number | null;
  air_date: string;
}

export interface SeasonMetadata {
  seasonNumber: number;
  name: string | null;
  overview: string | null;
  posterPath: string | null;
  airDate: string | null;
  episodeCount: number;
  episodes: {
    episodeNumber: number;
    title: string | null;
    overview: string | null;
    stillPath: string | null;
    runtime: number | null;
    airDate: string | null;
  }[];
}
```

---

## Phase 4: Database Access Layer

### 4.1 Update `src/lib/server/db/index.ts`

Rename `movies` object to `media` and add new methods:

```typescript
import { eq, and, desc, asc } from 'drizzle-orm';
import { media, seasons, episodes } from './schema';
import type { MediaType } from '$lib/types';

export const mediaDb = {
  // List media by type
  list(userId: string, type?: MediaType) {
    const conditions = [eq(media.userId, userId)];
    if (type) {
      conditions.push(eq(media.type, type));
    }
    return db
      .select()
      .from(media)
      .where(and(...conditions))
      .orderBy(desc(media.addedAt))
      .all();
  },

  // Get single media item
  getById(id: string) {
    return db.select().from(media).where(eq(media.id, id)).get();
  },

  // Create new media
  create(data: NewMedia) {
    const id = crypto.randomUUID();
    db.insert(media).values({ ...data, id }).run();
    return { ...data, id };
  },

  // Update media metadata
  updateMetadata(id: string, data: Partial<Media>) {
    db.update(media).set(data).where(eq(media.id, id)).run();
  },

  // Update progress
  updateProgress(id: string, progress: number, status: string) {
    db.update(media)
      .set({ progress, status })
      .where(eq(media.id, id))
      .run();
  },

  // Update file path
  updateFilePath(id: string, filePath: string, fileSize?: number) {
    db.update(media)
      .set({ filePath, fileSize, status: 'complete' })
      .where(eq(media.id, id))
      .run();
  },

  // Delete media
  delete(id: string, userId: string) {
    db.delete(media)
      .where(and(eq(media.id, id), eq(media.userId, userId)))
      .run();
  },

  // Get incomplete downloads
  getIncompleteDownloads() {
    return db
      .select()
      .from(media)
      .where(
        and(
          eq(media.status, 'downloading'),
          // or eq(media.status, 'added')
        )
      )
      .all();
  },
};

// Season operations
export const seasonsDb = {
  // Create season
  create(data: NewSeason) {
    const id = crypto.randomUUID();
    db.insert(seasons).values({ ...data, id }).run();
    return { ...data, id };
  },

  // Get seasons for a media item
  getByMediaId(mediaId: string) {
    return db
      .select()
      .from(seasons)
      .where(eq(seasons.mediaId, mediaId))
      .orderBy(asc(seasons.seasonNumber))
      .all();
  },

  // Get single season
  getById(id: string) {
    return db.select().from(seasons).where(eq(seasons.id, id)).get();
  },

  // Get season by media and number
  getByMediaAndNumber(mediaId: string, seasonNumber: number) {
    return db
      .select()
      .from(seasons)
      .where(
        and(
          eq(seasons.mediaId, mediaId),
          eq(seasons.seasonNumber, seasonNumber)
        )
      )
      .get();
  },

  // Update episode count
  updateEpisodeCount(id: string, count: number) {
    db.update(seasons)
      .set({ episodeCount: count })
      .where(eq(seasons.id, id))
      .run();
  },
};

// Episode operations
export const episodesDb = {
  // Create episode
  create(data: NewEpisode) {
    const id = crypto.randomUUID();
    db.insert(episodes).values({ ...data, id }).run();
    return { ...data, id };
  },

  // Get episodes for a season
  getBySeasonId(seasonId: string) {
    return db
      .select()
      .from(episodes)
      .where(eq(episodes.seasonId, seasonId))
      .orderBy(asc(episodes.displayOrder))
      .all();
  },

  // Get single episode
  getById(id: string) {
    return db.select().from(episodes).where(eq(episodes.id, id)).get();
  },

  // Get episode by season and number
  getBySeasonAndNumber(seasonId: string, episodeNumber: number) {
    return db
      .select()
      .from(episodes)
      .where(
        and(
          eq(episodes.seasonId, seasonId),
          eq(episodes.episodeNumber, episodeNumber)
        )
      )
      .get();
  },

  // Update episode file info
  updateFileInfo(id: string, fileIndex: number, filePath: string, fileSize: number) {
    db.update(episodes)
      .set({ fileIndex, filePath, fileSize })
      .where(eq(episodes.id, id))
      .run();
  },

  // Update episode progress
  updateProgress(id: string, downloadedBytes: number, status: string) {
    db.update(episodes)
      .set({ downloadedBytes, status })
      .where(eq(episodes.id, id))
      .run();
  },

  // Update display order (for reordering)
  updateDisplayOrder(id: string, displayOrder: number) {
    db.update(episodes)
      .set({ displayOrder })
      .where(eq(episodes.id, id))
      .run();
  },

  // Bulk update display orders
  bulkUpdateDisplayOrder(updates: { id: string; displayOrder: number }[]) {
    for (const { id, displayOrder } of updates) {
      db.update(episodes)
        .set({ displayOrder })
        .where(eq(episodes.id, id))
        .run();
    }
  },

  // Get all episodes for a media item (across all seasons)
  getByMediaId(mediaId: string) {
    return db
      .select({
        episode: episodes,
        season: seasons,
      })
      .from(episodes)
      .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
      .where(eq(seasons.mediaId, mediaId))
      .orderBy(asc(seasons.seasonNumber), asc(episodes.displayOrder))
      .all();
  },
};
```

---

## Phase 5: Enhanced Torrent Handling

### 5.1 Update `src/lib/server/torrent.ts`

Modify `ActiveDownload` interface and add multi-file support:

```typescript
interface ActiveDownload {
  mediaId: string;
  mediaType: 'movie' | 'tv';
  torrent: Torrent;
  videoFile: TorrentFile | null;      // Single file for movies
  videoFiles: TorrentFile[];          // Multiple files for TV shows
  selectedFileIndex: number | null;    // Currently selected file for streaming
  episodeMapping: Map<number, number>; // episodeKey (S*100+E) -> fileIndex
  progress: number;
  status: 'initializing' | 'downloading' | 'complete' | 'error';
  activeStreams: number;
  totalSize: number;
  error?: string;
}
```

### 5.2 Episode Mapping Logic

```typescript
// Parse filenames and map to episodes
function mapFilesToEpisodes(
  files: TorrentFile[]
): Map<number, number> {
  const mapping = new Map<number, number>();

  files.forEach((file, index) => {
    const parsed = ptt.parse(file.name);

    if (parsed.season !== undefined && parsed.episode !== undefined) {
      // Standard S01E01 format
      const episodeKey = parsed.season * 100 + parsed.episode;
      mapping.set(episodeKey, index);
    } else if (parsed.episode !== undefined) {
      // Episode only (assume season 1)
      const episodeKey = 100 + parsed.episode;
      mapping.set(episodeKey, index);
    }
  });

  return mapping;
}

// Auto-number fallback when mapping fails
function autoNumberFiles(files: TorrentFile[]): Map<number, number> {
  const mapping = new Map<number, number>();

  // Sort files by name to maintain order
  const sortedFiles = [...files].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true })
  );

  sortedFiles.forEach((file, index) => {
    // Assume season 1, episode = index + 1
    const episodeKey = 100 + (index + 1);
    mapping.set(episodeKey, files.indexOf(file));
  });

  return mapping;
}
```

### 5.3 Modified `torrent.on('ready')` Handler

```typescript
torrent.on('ready', async () => {
  console.log(`[${mediaId}] Torrent ready: ${torrent.infoHash}`);

  // Get media type from database
  const mediaItem = mediaDb.getById(mediaId);
  const mediaType = mediaItem?.type || 'movie';
  download.mediaType = mediaType;

  // Find all video files
  download.videoFiles = torrent.files
    .filter(f => isSupportedFormat(f.name) && f.length >= MIN_VIDEO_SIZE)
    .sort((a, b) => b.length - a.length);

  if (download.videoFiles.length === 0) {
    download.status = 'error';
    download.error = 'No supported video files found';
    return;
  }

  if (mediaType === 'tv') {
    // TV Show: map files to episodes
    download.episodeMapping = mapFilesToEpisodes(download.videoFiles);

    // If mapping failed, auto-number
    if (download.episodeMapping.size === 0) {
      console.log(`[${mediaId}] Episode mapping failed, using auto-number fallback`);
      download.episodeMapping = autoNumberFiles(download.videoFiles);
    }

    // Create episode records in database
    await createEpisodesFromMapping(mediaId, download.videoFiles, download.episodeMapping);

    // Calculate total size
    download.totalSize = download.videoFiles.reduce((sum, f) => sum + f.length, 0);

    // Don't auto-select any file - wait for user to pick an episode
    download.videoFiles.forEach(f => f.deselect());

  } else {
    // Movie: select single largest file
    download.videoFile = download.videoFiles[0];
    download.totalSize = download.videoFile.length;

    // Deselect all, then select video file
    torrent.files.forEach(f => f.deselect());
    download.videoFile.select();
  }

  download.status = 'downloading';

  // Fetch and update metadata
  fetchAndUpdateMetadata(mediaId, download.videoFile?.name || download.videoFiles[0]?.name);
});
```

### 5.4 Episode-Specific Streaming

```typescript
export async function getVideoStream(
  mediaId: string,
  fileIndex?: number,
  start?: number,
  end?: number
): Promise<StreamInfo | null> {
  // First check if file exists in library (completed downloads)
  const mediaItem = mediaDb.getById(mediaId);

  if (mediaItem?.type === 'movie' && mediaItem.filePath && existsSync(mediaItem.filePath)) {
    // Serve from library
    return createLibraryStream(mediaItem.filePath, start, end);
  }

  // Check active download
  const download = activeDownloads.get(mediaId);
  if (!download || download.status === 'error') {
    return null;
  }

  // For TV shows with fileIndex
  if (download.mediaType === 'tv' && fileIndex !== undefined) {
    const videoFile = download.videoFiles[fileIndex];
    if (!videoFile) return null;

    // Select this file for priority downloading, deselect others
    download.videoFiles.forEach((f, i) => {
      if (i === fileIndex) f.select();
      else f.deselect();
    });

    download.selectedFileIndex = fileIndex;

    return createTorrentStream(download, videoFile, start, end);
  }

  // For movies or default
  if (download.videoFile) {
    return createTorrentStream(download, download.videoFile, start, end);
  }

  return null;
}

// Select episode for priority downloading
export function selectEpisode(mediaId: string, seasonNumber: number, episodeNumber: number): boolean {
  const download = activeDownloads.get(mediaId);
  if (!download || download.mediaType !== 'tv') {
    return false;
  }

  const episodeKey = seasonNumber * 100 + episodeNumber;
  const fileIndex = download.episodeMapping.get(episodeKey);

  if (fileIndex === undefined) {
    return false;
  }

  // Select this file for priority
  download.videoFiles.forEach((f, i) => {
    if (i === fileIndex) f.select();
    else f.deselect();
  });

  download.selectedFileIndex = fileIndex;
  return true;
}
```

---

## Phase 6: API Endpoints

### 6.1 Rename `/api/movies` to `/api/media`

**File Structure:**
```
src/routes/api/
├── auth/[...all]/+server.ts          # Authentication (unchanged)
├── media/+server.ts                   # GET list, POST add (renamed from movies)
├── media/[id]/+server.ts              # GET single, DELETE
├── media/[id]/progress/+server.ts     # Download progress
├── media/[id]/progress/stream/+server.ts  # SSE progress
├── media/[id]/stream/+server.ts       # Video streaming (updated for episodes)
├── media/[id]/retry/+server.ts        # Retry failed downloads
├── media/[id]/seasons/+server.ts      # GET seasons for a show
├── media/[id]/seasons/[num]/+server.ts  # GET season with episodes
├── media/[id]/episodes/reorder/+server.ts  # POST reorder episodes
├── media/search/+server.ts            # Search TMDB (movies and TV)
└── search/+server.ts                  # Library search (unchanged)
```

### 6.2 Updated `/api/media/+server.ts`

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mediaDb } from '$lib/server/db';
import { parseMagnet } from '$lib/server/magnet';
import { searchMovie, searchTVShow, isTVShowFilename } from '$lib/server/tmdb';
import { startDownload } from '$lib/server/torrent';
import { config } from '$lib/config';

// GET /api/media?type=movie|tv
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) throw error(401);

  const type = url.searchParams.get('type') as 'movie' | 'tv' | null;
  const list = mediaDb.list(locals.user.id, type || undefined);

  return json(list);
};

// POST /api/media
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401);

  const { magnetLink, type: providedType, tmdbId } = await request.json();

  if (!magnetLink || !magnetLink.startsWith('magnet:')) {
    throw error(400, 'Invalid magnet link');
  }

  // Parse magnet for metadata
  const { infohash, title, year } = parseMagnet(magnetLink);

  // Determine media type (auto-detect or use provided)
  let mediaType = providedType;
  if (!mediaType && title) {
    mediaType = isTVShowFilename(title) ? 'tv' : 'movie';
  }
  mediaType = mediaType || 'movie';

  // Fetch metadata from TMDB
  let metadata = {
    title: title || 'Unknown',
    year,
    posterUrl: null as string | null,
    backdropUrl: null as string | null,
    overview: null as string | null,
    tmdbId: tmdbId || null,
    totalSeasons: null as number | null,
  };

  if (title && config.tmdb.apiKey) {
    try {
      const results = mediaType === 'tv'
        ? await searchTVShow(title, year)
        : await searchMovie(title, year);

      if (results.length > 0) {
        const best = tmdbId
          ? results.find(r => r.tmdbId === tmdbId) || results[0]
          : results[0];
        metadata = { ...metadata, ...best };
      }
    } catch (e) {
      console.error('TMDB search failed:', e);
    }
  }

  // Check for duplicate
  const existing = mediaDb.getByUserAndInfohash(locals.user.id, infohash);
  if (existing) {
    return json(existing, { status: 200 });
  }

  // Create media record
  const mediaItem = mediaDb.create({
    userId: locals.user.id,
    type: mediaType,
    title: metadata.title,
    year: metadata.year,
    posterUrl: metadata.posterUrl,
    backdropUrl: metadata.backdropUrl,
    overview: metadata.overview,
    magnetLink,
    infohash,
    tmdbId: metadata.tmdbId,
    totalSeasons: metadata.totalSeasons,
  });

  // Start download
  if (config.features.fileStorage) {
    startDownload(mediaItem.id, magnetLink);
  }

  return json(mediaItem, { status: 201 });
};
```

### 6.3 New `/api/media/[id]/seasons/+server.ts`

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mediaDb, seasonsDb, episodesDb } from '$lib/server/db';

// GET /api/media/[id]/seasons
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401);

  const mediaItem = mediaDb.getById(params.id);
  if (!mediaItem || mediaItem.userId !== locals.user.id) {
    throw error(404, 'Media not found');
  }

  if (mediaItem.type !== 'tv') {
    throw error(400, 'Not a TV show');
  }

  const seasons = seasonsDb.getByMediaId(params.id);

  // Include episodes for each season
  const seasonsWithEpisodes = seasons.map(season => ({
    ...season,
    episodes: episodesDb.getBySeasonId(season.id),
  }));

  return json(seasonsWithEpisodes);
};
```

### 6.4 New `/api/media/[id]/episodes/reorder/+server.ts`

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mediaDb, episodesDb } from '$lib/server/db';

// POST /api/media/[id]/episodes/reorder
export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) throw error(401);

  const mediaItem = mediaDb.getById(params.id);
  if (!mediaItem || mediaItem.userId !== locals.user.id) {
    throw error(404, 'Media not found');
  }

  const { episodeOrders } = await request.json();

  if (!Array.isArray(episodeOrders)) {
    throw error(400, 'Invalid episode orders');
  }

  // Validate and update
  for (const { id, displayOrder } of episodeOrders) {
    if (typeof id !== 'string' || typeof displayOrder !== 'number') {
      throw error(400, 'Invalid episode order format');
    }
    episodesDb.updateDisplayOrder(id, displayOrder);
  }

  return json({ success: true });
};
```

### 6.5 Updated `/api/media/[id]/stream/+server.ts`

```typescript
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mediaDb, episodesDb } from '$lib/server/db';
import { getVideoStream, waitForVideoReady, startDownload, isDownloadActive } from '$lib/server/torrent';

export const GET: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) throw error(401);

  const mediaItem = mediaDb.getById(params.id);
  if (!mediaItem || mediaItem.userId !== locals.user.id) {
    throw error(404, 'Media not found');
  }

  // Get optional fileIndex for TV shows
  const url = new URL(request.url);
  const fileIndexParam = url.searchParams.get('fileIndex');
  const fileIndex = fileIndexParam ? parseInt(fileIndexParam, 10) : undefined;

  // Parse range header
  const range = request.headers.get('range');
  let start: number | undefined;
  let end: number | undefined;

  if (range) {
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      start = parseInt(match[1], 10);
      end = match[2] ? parseInt(match[2], 10) : undefined;
    }
  }

  // Ensure download is active
  if (!isDownloadActive(params.id) && mediaItem.magnetLink) {
    await startDownload(params.id, mediaItem.magnetLink);
  }

  // Wait for video to be ready
  const ready = await waitForVideoReady(params.id);
  if (!ready) {
    throw error(503, 'Video not ready');
  }

  // Get stream
  const streamInfo = await getVideoStream(params.id, fileIndex, start, end);
  if (!streamInfo) {
    throw error(404, 'Stream not available');
  }

  // Build response headers
  const headers: Record<string, string> = {
    'Content-Type': streamInfo.mimeType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };

  if (start !== undefined) {
    const contentLength = (end || streamInfo.fileSize - 1) - start + 1;
    headers['Content-Range'] = `bytes ${start}-${end || streamInfo.fileSize - 1}/${streamInfo.fileSize}`;
    headers['Content-Length'] = String(contentLength);

    return new Response(streamInfo.stream as unknown as BodyInit, {
      status: 206,
      headers,
    });
  }

  headers['Content-Length'] = String(streamInfo.fileSize);

  return new Response(streamInfo.stream as unknown as BodyInit, {
    status: 200,
    headers,
  });
};
```

### 6.6 New `/api/media/search/+server.ts`

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchMovie, searchTVShow } from '$lib/server/tmdb';

// GET /api/media/search?q=query&type=movie|tv
export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) throw error(401);

  const query = url.searchParams.get('q');
  const type = url.searchParams.get('type') as 'movie' | 'tv' | null;
  const year = url.searchParams.get('year');

  if (!query || query.length < 2) {
    throw error(400, 'Query too short');
  }

  const yearNum = year ? parseInt(year, 10) : undefined;

  let results;
  if (type === 'tv') {
    results = await searchTVShow(query, yearNum);
  } else if (type === 'movie') {
    results = await searchMovie(query, yearNum);
  } else {
    // Search both
    const [movies, shows] = await Promise.all([
      searchMovie(query, yearNum),
      searchTVShow(query, yearNum),
    ]);
    results = [
      ...movies.map(m => ({ ...m, type: 'movie' as const })),
      ...shows.map(s => ({ ...s, type: 'tv' as const })),
    ];
  }

  return json(results);
};
```

---

## Phase 7: Frontend Updates

### 7.1 Library Page with Tabs (`src/routes/(app)/+page.svelte`)

```svelte
<script lang="ts">
  import { Film, Tv } from 'lucide-svelte';
  import MediaCard from '$lib/components/MediaCard.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import type { Media } from '$lib/types';

  let movies: Media[] = $state([]);
  let shows: Media[] = $state([]);
  let loading = $state(true);
  let activeTab = $state<'movies' | 'tv'>('movies');

  async function loadLibrary() {
    loading = true;
    try {
      const [moviesRes, showsRes] = await Promise.all([
        fetch('/api/media?type=movie'),
        fetch('/api/media?type=tv'),
      ]);

      if (moviesRes.ok) movies = await moviesRes.json();
      if (showsRes.ok) shows = await showsRes.json();
    } catch (e) {
      console.error('Failed to load library:', e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    loadLibrary();
  });
</script>

<div class="container mx-auto px-4 py-8">
  <!-- Tabs -->
  <div class="flex gap-2 mb-6 border-b border-border pb-4">
    <Button
      variant={activeTab === 'movies' ? 'default' : 'ghost'}
      onclick={() => activeTab = 'movies'}
    >
      <Film class="w-4 h-4 mr-2" />
      Movies
      {#if movies.length > 0}
        <span class="ml-2 text-xs bg-accent px-2 py-0.5 rounded-full">
          {movies.length}
        </span>
      {/if}
    </Button>
    <Button
      variant={activeTab === 'tv' ? 'default' : 'ghost'}
      onclick={() => activeTab = 'tv'}
    >
      <Tv class="w-4 h-4 mr-2" />
      TV Shows
      {#if shows.length > 0}
        <span class="ml-2 text-xs bg-accent px-2 py-0.5 rounded-full">
          {shows.length}
        </span>
      {/if}
    </Button>
  </div>

  {#if loading}
    <div class="flex items-center justify-center p-20">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  {:else}
    {#if activeTab === 'movies'}
      {#if movies.length === 0}
        <EmptyState type="movie" />
      {:else}
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {#each movies as movie (movie.id)}
            <MediaCard media={movie} />
          {/each}
        </div>
      {/if}
    {:else}
      {#if shows.length === 0}
        <EmptyState type="tv" />
      {:else}
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {#each shows as show (show.id)}
            <MediaCard media={show} />
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</div>
```

### 7.2 Rename MovieCard to MediaCard

Rename `src/lib/components/MovieCard.svelte` to `MediaCard.svelte` and update:
- Accept `media` prop instead of `movie`
- Add context menu for TV shows (seasons → episodes)
- Link movies to `/watch/[id]`, TV shows to `/show/[id]`

### 7.3 Show Details Page (`src/routes/(app)/show/[id]/+page.svelte`)

```svelte
<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import EpisodeSelector from '$lib/components/EpisodeSelector.svelte';
  import type { MediaWithSeasons, Episode } from '$lib/types';

  let media: MediaWithSeasons | null = $state(null);
  let loading = $state(true);

  async function loadShow() {
    const [mediaRes, seasonsRes] = await Promise.all([
      fetch(`/api/media/${page.params.id}`),
      fetch(`/api/media/${page.params.id}/seasons`),
    ]);

    if (mediaRes.ok && seasonsRes.ok) {
      const mediaData = await mediaRes.json();
      const seasons = await seasonsRes.json();
      media = { ...mediaData, seasons };
    }

    loading = false;
  }

  function handlePlayEpisode(episodeId: string, episode: Episode) {
    // Navigate to watch page with fileIndex
    goto(`/watch/${page.params.id}?episodeId=${episodeId}&fileIndex=${episode.fileIndex}`);
  }

  $effect(() => {
    loadShow();
  });
</script>

{#if loading}
  <div class="flex items-center justify-center min-h-screen">
    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
{:else if media}
  <!-- Hero Section -->
  <div
    class="relative h-[50vh] bg-cover bg-center"
    style="background-image: url({media.backdropUrl})"
  >
    <div class="absolute inset-0 bg-gradient-to-t from-background to-transparent"></div>
    <div class="absolute bottom-0 left-0 right-0 p-8">
      <h1 class="text-4xl font-bold">{media.title}</h1>
      {#if media.year}
        <p class="text-muted-foreground">{media.year}</p>
      {/if}
      {#if media.overview}
        <p class="mt-4 max-w-2xl text-sm text-muted-foreground line-clamp-3">
          {media.overview}
        </p>
      {/if}
    </div>
  </div>

  <!-- Episode Selector -->
  <div class="container mx-auto px-4 py-8">
    <EpisodeSelector
      seasons={media.seasons}
      mediaId={media.id}
      onPlayEpisode={handlePlayEpisode}
    />
  </div>
{:else}
  <div class="flex items-center justify-center min-h-screen">
    <p class="text-muted-foreground">Show not found</p>
  </div>
{/if}
```

### 7.4 Episode Reorder Modal (`src/lib/components/EpisodeReorderModal.svelte`)

```svelte
<script lang="ts">
  import { GripVertical, Save } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import type { Episode } from '$lib/types';

  let {
    open = $bindable(false),
    episodes,
    mediaId,
    seasonId,
    onSave,
  }: {
    open: boolean;
    episodes: Episode[];
    mediaId: string;
    seasonId: string;
    onSave: (reorderedEpisodes: Episode[]) => void;
  } = $props();

  let localEpisodes = $state<Episode[]>([]);
  let saving = $state(false);
  let draggedIndex = $state<number | null>(null);

  $effect(() => {
    if (open) {
      localEpisodes = [...episodes].sort((a, b) => a.displayOrder - b.displayOrder);
    }
  });

  function handleDragStart(index: number) {
    draggedIndex = index;
  }

  function handleDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newEpisodes = [...localEpisodes];
    const draggedItem = newEpisodes[draggedIndex];
    newEpisodes.splice(draggedIndex, 1);
    newEpisodes.splice(index, 0, draggedItem);

    // Update display orders
    newEpisodes.forEach((ep, i) => {
      ep.displayOrder = i;
    });

    localEpisodes = newEpisodes;
    draggedIndex = index;
  }

  function handleDragEnd() {
    draggedIndex = null;
  }

  async function saveOrder() {
    saving = true;

    try {
      const episodeOrders = localEpisodes.map((ep, index) => ({
        id: ep.id,
        displayOrder: index,
      }));

      const res = await fetch(`/api/media/${mediaId}/episodes/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeOrders }),
      });

      if (res.ok) {
        onSave(localEpisodes);
        open = false;
      }
    } catch (e) {
      console.error('Failed to save order:', e);
    } finally {
      saving = false;
    }
  }
</script>

<Dialog bind:open title="Reorder Episodes" description="Drag episodes to reorder them">
  <div class="max-h-96 overflow-y-auto space-y-2 py-4">
    {#each localEpisodes as episode, index (episode.id)}
      <div
        class="flex items-center gap-3 p-3 bg-accent/30 rounded-lg cursor-move"
        draggable="true"
        ondragstart={() => handleDragStart(index)}
        ondragover={(e) => handleDragOver(e, index)}
        ondragend={handleDragEnd}
        class:opacity-50={draggedIndex === index}
      >
        <GripVertical class="w-4 h-4 text-muted-foreground" />
        <span class="font-mono text-sm text-muted-foreground">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span class="flex-1 truncate">
          {episode.title || `Episode ${episode.episodeNumber}`}
        </span>
        <span class="text-xs text-muted-foreground">
          {episode.filePath ? 'Mapped' : 'Unmapped'}
        </span>
      </div>
    {/each}
  </div>

  <div class="flex justify-end gap-2 pt-4">
    <Button variant="ghost" onclick={() => open = false}>Cancel</Button>
    <Button onclick={saveOrder} disabled={saving}>
      <Save class="w-4 h-4 mr-2" />
      {saving ? 'Saving...' : 'Save Order'}
    </Button>
  </div>
</Dialog>
```

### 7.5 Watch Page Updates (`src/routes/(app)/watch/[id]/+page.svelte`)

Add support for `?episodeId=xxx&fileIndex=xxx` query params:

```svelte
<script lang="ts">
  import { page } from '$app/state';

  // Get episode info from URL
  const episodeId = $derived(page.url.searchParams.get('episodeId'));
  const fileIndex = $derived(page.url.searchParams.get('fileIndex'));

  // Build stream URL
  const streamUrl = $derived(() => {
    let url = `/api/media/${page.params.id}/stream`;
    if (fileIndex) {
      url += `?fileIndex=${fileIndex}`;
    }
    return url;
  });

  // Load episode metadata if watching a TV show episode
  let episodeInfo: Episode | null = $state(null);

  $effect(() => {
    if (episodeId) {
      loadEpisodeInfo(episodeId);
    }
  });

  async function loadEpisodeInfo(id: string) {
    // Fetch episode details for display
    // ...
  }
</script>
```

### 7.6 Add Media Dialog Update

Update the add media dialog to:
1. Auto-detect type from magnet filename
2. Show type toggle (Movie/TV Show)
3. Show TMDB search results dropdown for manual override

---

## Phase 8: Migration Strategy

### 8.1 Database Migration Script

Create `migrations/002_tv_support.sql`:

```sql
-- Rename movies table to media
ALTER TABLE movies RENAME TO media;

-- Add type column
ALTER TABLE media ADD COLUMN type TEXT DEFAULT 'movie' CHECK(type IN ('movie', 'tv'));
ALTER TABLE media ADD COLUMN total_seasons INTEGER;

-- Create new index
CREATE INDEX idx_media_type ON media(user_id, type);

-- Create seasons table
CREATE TABLE seasons (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL,
  name TEXT,
  overview TEXT,
  poster_path TEXT,
  air_date TEXT,
  episode_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  UNIQUE(media_id, season_number)
);
CREATE INDEX idx_seasons_media ON seasons(media_id);

-- Create episodes table
CREATE TABLE episodes (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  title TEXT,
  overview TEXT,
  still_path TEXT,
  runtime INTEGER,
  air_date TEXT,
  file_index INTEGER,
  file_path TEXT,
  file_size INTEGER,
  downloaded_bytes INTEGER DEFAULT 0,
  display_order INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'downloading', 'complete', 'error')),
  created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  UNIQUE(season_id, episode_number)
);
CREATE INDEX idx_episodes_season ON episodes(season_id);
CREATE INDEX idx_episodes_status ON episodes(status);
CREATE INDEX idx_episodes_display_order ON episodes(season_id, display_order);
```

### 8.2 Drizzle Migration

Run Drizzle generate and migrate:

```bash
npm run db:generate
npm run db:migrate
```

### 8.3 Code Migration

1. Update all imports from `movies` to `media`/`mediaDb`
2. Rename component files
3. Update API route files
4. Update frontend references

---

## Implementation Order

1. **Database Migration**
   - Create migration SQL
   - Update Drizzle schema
   - Run migration

2. **Type Updates**
   - Update `src/lib/types.ts`
   - Add Season, Episode types
   - Add MediaType enum

3. **DB Layer Updates**
   - Rename `movies` to `media` in `db/index.ts`
   - Add season/episode methods
   - Add reorder method

4. **TMDB Integration**
   - Add TV search function
   - Add season details function
   - Add auto-detect function

5. **Torrent Handler Updates**
   - Add multi-file support
   - Add episode mapping logic
   - Add auto-number fallback
   - Update streaming for fileIndex

6. **API Route Updates**
   - Rename `/api/movies` to `/api/media`
   - Add `?type=` query param
   - Add seasons endpoint
   - Add reorder endpoint
   - Update stream endpoint for fileIndex

7. **Frontend Updates**
   - Add tabs to library page
   - Rename MovieCard to MediaCard
   - Create show details page
   - Add episode reorder modal
   - Update watch page for episodes
   - Update add media dialog

8. **Testing**
   - Test movie add flow (unchanged)
   - Test TV show add flow
   - Test episode streaming
   - Test reordering
   - Test auto-detect

---

## Files to Modify

### New Files
- `src/routes/(app)/show/[id]/+page.svelte`
- `src/routes/(app)/show/[id]/+page.server.ts`
- `src/routes/api/media/[id]/seasons/+server.ts`
- `src/routes/api/media/[id]/seasons/[num]/+server.ts`
- `src/routes/api/media/[id]/episodes/reorder/+server.ts`
- `src/routes/api/media/search/+server.ts`
- `src/lib/components/EpisodeReorderModal.svelte`
- `migrations/002_tv_support.sql`

### Renamed Files
- `src/routes/api/movies/` → `src/routes/api/media/`
- `src/lib/components/MovieCard.svelte` → `src/lib/components/MediaCard.svelte`

### Modified Files
- `src/lib/types.ts` - Add TV types, rename Movie to Media
- `src/lib/server/db/schema.ts` - Add seasons/episodes tables, rename movies
- `src/lib/server/db/index.ts` - Add show/season/episode methods
- `src/lib/server/tmdb.ts` - Add TV API functions
- `src/lib/server/torrent.ts` - Multi-file torrent support
- `src/routes/(app)/+page.svelte` - Add tabs, integrate media cards
- `src/routes/(app)/watch/[id]/+page.svelte` - Episode support
- `src/lib/components/EpisodeSelector.svelte` - Already exists, verify works

---

## Testing Checklist

- [ ] Movies still work (add, stream, delete)
- [ ] Library tabs filter correctly
- [ ] TV show auto-detection works
- [ ] Manual TMDB override works
- [ ] Episode mapping from filenames works
- [ ] Auto-number fallback works
- [ ] Episode streaming works
- [ ] Episode reordering works
- [ ] Show details page displays correctly
- [ ] EpisodeSelector component works
- [ ] Download progress shows correctly for TV shows
- [ ] Migration doesn't break existing data
