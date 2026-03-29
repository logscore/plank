# Unified Media Model Overhaul [COMPLETE]

## Overview

Merge the `episodes` table into `media`. Every watchable thing (movie, episode) becomes a `media` row. TV shows become `type='show'` containers. The `type='tv'` value is renamed to `type='show'`. Subtitles drop `episodeId` and always use `mediaId`. One feature branch, one migration, all ~33 files updated together.

---

## Motivation

The current model has a fundamental tension: `media` tries to be two things at once.

**For movies**, `media` is the atomic downloadable unit — it has `magnetLink`, `infohash`, `filePath`, `fileSize`, `playPosition`, `status`, and `progress` directly on the row.

**For TV shows**, `media` is a container — it holds show-level metadata (title, poster, totalSeasons), but the real action happens on `episodes` (which have their own `filePath`, `fileSize`, `status`, `playPosition`). The `magnetLink`/`infohash` on the `media` row are vestigial for TV (only the first torrent's data).

### Pain Points

1. **Dual source of truth** — `media` has download state (status, progress, magnetLink, infohash) AND `downloads` has the same fields. For TV, the `media`-level fields are meaningless aggregates.
2. **`media.filePath`/`fileSize`/`playPosition`** — only meaningful for movies, dead weight for TV.
3. **Status enum mismatch** — `media` uses `'added'`, episodes use `'pending'`.
4. **Episodes can't stand alone** — they're deeply nested and don't carry their own torrent/magnet metadata.
5. **`episodes.downloadId` has no FK constraint** — declared as plain `text` with no `.references()`, only a Drizzle relation.
6. **`media.magnetLink` is NOT NULL but stale** — for multi-download TV shows, it only holds the first torrent's magnet. Retry logic only retries the original torrent.
7. **Streaming requires branching** — movies use `mediaId`, TV requires `?episodeId=` parameter, splitting every streaming/playback path.

---

## Architecture Decision

### Chosen: Single `media` table for everything

Every watchable thing is a row in `media`. Movies, shows, and episodes all live in the same table, differentiated by `type` and connected via `parentId`.

```
media (type='movie')          → standalone, downloadable, playable
media (type='show')           → container only, not downloadable or playable
  └── media (type='episode')  → downloadable, playable, linked to show via parentId
```

### Seasons: Kept as a separate lightweight table

Seasons are a grouping concept, not a watchable unit. The `seasons` table stays as-is (id, mediaId → show, seasonNumber, name, posterPath, airDate, episodeCount). Episodes reference `seasonId`.

### Downloads: 1:1 with downloadable media

Each `downloads` row points to exactly one `media` row (a movie or an episode). The per-episode download model from the TV Season Overhaul plan fits this perfectly.

### Episode ownership: Denormalized

Every media row (movie, show, episode) carries its own `userId` + `organizationId`. Redundant for episodes but makes every query self-contained.

### Show-level status: None

Show rows have no download status. Status only lives on movies and episodes. The UI computes show-level status by aggregating episode statuses.

### Subtitles: Drop `episodeId`, use `mediaId` only

Subtitles always reference the specific media row (movie or episode) via `mediaId`. The separate `episodeId` FK is removed.

---

## Hierarchy Example

```
┌──────────────────────────────────────────────────────────┐
│ media row: type='show', title='Breaking Bad'             │  ← show container
│   - No magnetLink, no filePath, no download state        │
│   - Holds show-level metadata: poster, backdrop,         │
│     overview, totalSeasons, certification, genres        │
│   - This is what appears in the user's library list      │
└──────────────┬───────────────────────────────────────────┘
               │ parentId
               ▼
┌──────────────────────────────────────────────────────────┐
│ media row: type='episode', title='Pilot'                 │  ← episode 1
│   parentId → Breaking Bad show row                       │
│   seasonId → Season 1 row                                │
│   magnetLink, filePath, status, playPosition, etc.       │
│   episodeNumber=1, seasonNumber=1                        │
├──────────────────────────────────────────────────────────┤
│ media row: type='episode', title="Cat's in the Bag"      │  ← episode 2
│   parentId → Breaking Bad show row                       │
│   ...                                                    │
└──────────────────────────────────────────────────────────┘
```

---

## Unified Schema

### `media` table

```
media
│
├── # Core Identity (ALL types)
├── id                  text PK
├── type                'movie' | 'show' | 'episode'
├── title               text NOT NULL
├── overview            text
├── year                integer
├── tmdbId              integer
├── imdbId              text
├── runtime             integer
├── originalLanguage    text
├── addedAt             timestamp_ms NOT NULL
├── createdAt           timestamp_ms NOT NULL
│
├── # Ownership (ALL types — denormalized on episodes)
├── userId              text FK → user.id NOT NULL
├── organizationId      text FK → organization.id
│
├── # Display (movies + shows; episodes use stillPath)
├── posterUrl           text
├── backdropUrl         text
├── genres              text (JSON array)
├── certification       text
│
├── # Show-specific (only type='show')
├── totalSeasons        integer
│
├── # Episode hierarchy (only type='episode')
├── parentId            text FK → media.id (self-ref, points to show)
├── seasonId            text FK → seasons.id
├── episodeNumber       integer
├── seasonNumber        integer (denormalized for easy queries)
├── displayOrder        integer
├── stillPath           text (episode thumbnail)
├── airDate             text
│
├── # Download state (movies + episodes; NULL for shows)
├── magnetLink          text
├── infohash            text
├── status              'pending' | 'searching' | 'downloading' | 'complete' | 'error' | 'not_found'
├── progress            real DEFAULT 0
│
├── # File state (movies + episodes; NULL for shows)
├── filePath            text
├── fileSize            integer
├── fileIndex           integer (index within torrent, episodes only)
├── downloadedBytes     integer DEFAULT 0
│
├── # Playback (movies + episodes; NULL for shows)
├── playPosition        real DEFAULT 0
├── playDuration        real
├── lastPlayedAt        timestamp_ms
```

### Sparse Column Audit

| Column | movie | show | episode | Notes |
|---|---|---|---|---|
| `parentId` | null | null | **set** | Only episodes have a parent |
| `seasonId` | null | null | **set** | Only episodes belong to a season |
| `episodeNumber` | null | null | **set** | |
| `seasonNumber` | null | null | **set** | Denormalized from seasons table |
| `displayOrder` | null | null | **set** | |
| `stillPath` | null | null | **set** | Episode thumbnail |
| `airDate` | null | null | **set** | |
| `totalSeasons` | null | **set** | null | Only shows |
| `posterUrl` | **set** | **set** | null | Episodes use stillPath |
| `backdropUrl` | **set** | **set** | null | |
| `genres` | **set** | **set** | null | Could inherit from parent show |
| `certification` | **set** | **set** | null | |
| `magnetLink` | **set** | null | **set** | |
| `infohash` | **set** | null | **set** | |
| `status` | **set** | null | **set** | Shows have no download status |
| `progress` | **set** | null | **set** | |
| `filePath` | **set** | null | **set** | |
| `fileSize` | **set** | null | **set** | |
| `fileIndex` | null | null | **set** | |
| `downloadedBytes` | null | null | **set** | |
| `playPosition` | **set** | null | **set** | |
| `playDuration` | **set** | null | **set** | |
| `lastPlayedAt` | **set** | null | **set** | |

7 episode-only columns, 1 show-only column, ~4 movie+show columns that episodes don't use. Reasonable sparsity.

### `seasons` table (unchanged)

```
seasons
├── id                  text PK
├── mediaId             text FK → media.id (the show)
├── seasonNumber        integer NOT NULL
├── name                text
├── overview            text
├── posterPath          text
├── airDate             text
├── episodeCount        integer DEFAULT 0
├── createdAt           timestamp_ms NOT NULL
UNIQUE(mediaId, seasonNumber)
```

### `downloads` table (simplified — 1:1 with downloadable media)

```
downloads
├── id                  text PK
├── mediaId             text FK → media.id (movie OR episode)
├── magnetLink          text NOT NULL
├── infohash            text NOT NULL
├── status              'added' | 'downloading' | 'complete' | 'error'
├── progress            real DEFAULT 0
├── addedAt             timestamp_ms NOT NULL
UNIQUE(mediaId, infohash)
```

### Indexes

```sql
-- Library listing (movies + shows)
CREATE INDEX idx_media_library ON media(organizationId, type) WHERE type IN ('movie', 'show');

-- Episode listing for a show
CREATE INDEX idx_media_episodes ON media(parentId, seasonId, displayOrder) WHERE type = 'episode';

-- Infohash uniqueness (for dedup)
CREATE UNIQUE INDEX media_org_infohash ON media(organizationId, infohash) WHERE infohash IS NOT NULL;

-- Status queries
CREATE INDEX idx_media_status ON media(status) WHERE status IS NOT NULL;

-- Continue watching
CREATE INDEX idx_media_watching ON media(organizationId, lastPlayedAt) WHERE playPosition > 0;
```

---

## What Changes

| Aspect | Before | After |
|---|---|---|
| Movie | 1 `media` row + 1 `downloads` row | Same — 1 `media` (type='movie') + 1 `downloads` |
| TV Show | 1 `media` row + N `downloads` + N `seasons` + N `episodes` | 1 `media` (type='show') + N `seasons` + N `media` (type='episode') + N `downloads` |
| Episode identity | Separate `episodes` table | Row in `media` with `type='episode'`, `parentId` → show |
| Episode download state | Split across `episodes.status` + `downloads.status` + `media.status` | `media.status` on the episode row (single source of truth) |
| Play position | Movies: `media.playPosition`. TV: `episodes.playPosition` + fragile sync to `media.playPosition` | Always `media.playPosition` on the specific watchable |
| Streaming URL | Movies: `/stream?mediaId=X`. TV: `/stream?mediaId=X&episodeId=Y` | Always `/api/media/{id}/stream` where id is the movie or episode |
| Continue watching | Queries `media` where `playPosition > 0`, only works cleanly for movies | Same query works for both: `WHERE playPosition > 0 AND type IN ('movie', 'episode')` |
| `filePath` | Movies: on `media`. TV: on `episodes` | Always on `media` row for the specific watchable |
| Library listing | `WHERE type IN ('movie', 'tv')` | `WHERE type IN ('movie', 'show')` |
| Subtitles FK | `subtitles.mediaId` + `subtitles.episodeId` | `subtitles.mediaId` only (points to movie or episode) |
| Show status | Stored on `media.status`, aggregated from downloads | Not stored — computed in UI by aggregating episode statuses |

---

## What Gets Deleted

- **`episodes` table** → absorbed into `media` with `type='episode'`
- **`episodesDb` object in `db.ts`** → replaced by methods on `mediaDb`
- **`Episode`, `NewEpisode`, `EpisodeStatus` types** → replaced by `Media` with type narrowing
- **`subtitles.episodeId` column** → replaced by `subtitles.mediaId` pointing to the episode media row
- **`?episodeId` query parameter** → removed from all streaming/position/subtitle API routes

---

## Blast Radius: 33 Files

| Category | File Count | Files |
|---|---|---|
| Schema/Types | 2 | `schema.ts`, `types.ts` |
| DB Access Layer | 1 | `db.ts` (~160 lines of `episodesDb` removed) |
| API Routes | 8 | stream, seasons, seasons/[num], position, subtitles, subtitles/download, subtitles/[subtitleId], episodes/reorder |
| Frontend Components | 7 | show/[id], watch/[id], EpisodeSelector, MediaCard, SubtitleMenu, OpenSubtitlesDialog, ContextMenu |
| Backend Services | 5 | torrent.ts (~137 refs), transcoder.ts, subtitles.ts, tmdb.ts, prowlarr.ts |
| Client Query Layer | 2 | query-keys.ts, media-queries.ts |
| Tests | 5 | db.test.ts, media.test.ts, transcoder.test.ts, stream-route.test.ts, streaming.test.ts |
| Documentation | 3 | ARCHITECTURE.md, TV_SEASON_OVERHAUL.md, TV_SHOW_IMPLEMENTATION.md |

---

## Implementation Order

### Step 1 — Schema (`schema.ts`)

- Add new columns to `media`: `parentId`, `seasonId`, `episodeNumber`, `seasonNumber`, `displayOrder`, `stillPath`, `airDate`, `imdbId`, `fileIndex`, `downloadedBytes`, `createdAt`
- Make nullable: `magnetLink`, `infohash`
- Change `type` enum: `'movie' | 'show' | 'episode'`
- Change `status` enum: `'pending' | 'searching' | 'downloading' | 'complete' | 'error' | 'not_found'`
- Add self-referencing FK: `parentId → media.id`
- Add FK: `seasonId → seasons.id`
- Add indexes for episodes (parentId, seasonId, displayOrder)
- Add partial unique index on (organizationId, infohash) WHERE infohash IS NOT NULL
- Remove `episodes` table definition, relations, type exports
- Update `seasonsRelations`, `downloadsRelations`, `subtitlesRelations`
- Remove `episodeId` from `subtitles` table
- Update `subtitlesRelations` to drop the episode reference

### Step 2 — Drizzle Migration

- Generate migration with `drizzle-kit generate`
- Write data migration SQL:
  1. `ALTER TABLE media` — add new columns, make magnetLink/infohash nullable
  2. `INSERT INTO media (type='episode', ...)` SELECT from episodes JOIN seasons JOIN media(show) — copy all episode data as new media rows
  3. `UPDATE downloads SET mediaId = new_episode_media_id` WHERE applicable
  4. `UPDATE subtitles SET mediaId = new_episode_media_id` WHERE episodeId IS NOT NULL
  5. `ALTER TABLE subtitles DROP COLUMN episodeId`
  6. `UPDATE media SET type='show' WHERE type='tv'`
  7. `DROP TABLE episodes`

### Step 3 — Types (`types.ts`)

- Remove `Episode`, `EpisodeStatus`, `SeasonWithEpisodes`
- Update `MediaType` to `'movie' | 'show' | 'episode'`
- Update `MediaStatus` to include `'pending' | 'searching' | 'not_found'`
- Add `Media` interface with all unified fields
- Add helper type guards: `isMovie(m)`, `isShow(m)`, `isEpisode(m)`
- Redefine `SeasonWithEpisodes` as `Season & { episodes: Media[] }`

### Step 4 — DB Access Layer (`db.ts`)

- Remove entire `episodesDb` export (~160 lines)
- Add to `mediaDb`:
  - `getEpisodesBySeasonId(seasonId)` — `WHERE type='episode' AND seasonId=?`
  - `getEpisodesByParentId(parentId)` — `WHERE type='episode' AND parentId=?`
  - `getEpisodeBySeasonAndNumber(seasonId, episodeNumber)`
  - `updateFileInfo(id, data)` — updates fileIndex, filePath, fileSize
  - `updateEpisodeProgress(id, downloadedBytes, status)`
  - `updateDisplayOrder(id, displayOrder)` / `bulkUpdateDisplayOrder(orders)`
  - `updatePlayPosition(id, position, duration)`
- Update `subtitlesDb`: remove all `episodeId` references, `getByEpisodeId()` → use `getByMediaId()`

### Step 5 — Backend Services

**torrent.ts** (~137 references, heaviest file):
- Replace all `episodesDb.*` calls with `mediaDb.*` equivalents
- `createEpisodesFromMapping()` → creates `media` rows with `type='episode'`, `parentId`, `seasonId`, `userId`, `organizationId` copied from parent show
- `updateEpisodeFileInfo()` → `mediaDb.updateFileInfo()`
- Streaming: `getVideoStream()` — remove episodeId parameter branching; the media ID IS the episode
- `getTVEpisodeLibraryStream()` → becomes normal media library stream lookup
- `ActiveDownload` type: `episodeMapping` stays as a runtime-only in-memory structure

**transcoder.ts:**
- `episodesDb.getByMediaId()` → `mediaDb.getEpisodesByParentId()`
- `episodesDb.updateFileInfo()` → `mediaDb.updateFileInfo()`

**subtitles.ts:**
- Remove `episodeId` parameter from all functions
- `discoverSidecarSubtitles()`, `discoverSubtitles()`, `getSubtitleTracks()` — use `mediaId` only

**prowlarr.ts** — no changes needed for the schema unification.

**tmdb.ts** — no schema changes needed (TMDB types are external API response shapes).

### Step 6 — API Routes (8 routes)

| Route | Change |
|---|---|
| `/api/media/[id]/stream` | Remove `?episodeId` logic. `[id]` is the movie or episode. |
| `/api/media/[id]/position` | Remove `?episodeId` branching. `[id]` is the watchable. |
| `/api/media/[id]/seasons` | Return seasons with nested `media` rows (type='episode'). |
| `/api/media/[id]/seasons/[num]` | Create `media` rows (type='episode') from TMDB data instead of episode rows. |
| `/api/media/[id]/episodes/reorder` | Update media rows by ID instead of episode rows. |
| `/api/media/[id]/subtitles` | Remove `episodeId` handling. |
| `/api/media/[id]/subtitles/download` | Remove `episodeId` from request body. |
| `/api/media/[id]/subtitles/search` | Keep `episodeNumber` as search param (OpenSubtitles API needs it). |

### Step 7 — Frontend (7 components)

| Component | Change |
|---|---|
| `show/[id]/+page.svelte` | Replace `Episode` type with `Media`. Episode list uses media fields. |
| `watch/[id]/+page.svelte` | Remove `?episodeId` from URL. Navigate to `/watch/{episodeMediaId}`. Stream URL becomes `/api/media/{id}/stream`. |
| `EpisodeSelector.svelte` | Update types from `Episode` to `Media`. `onPlayEpisode` passes the episode's media ID. |
| `MediaCard.svelte` | Update episode loading to use new types. |
| `SubtitleMenu.svelte` | Remove `episodeId` prop. Use `mediaId` (the episode's own ID). |
| `OpenSubtitlesDialog.svelte` | Remove `episodeId` prop. Use `mediaId`. Keep `episodeNumber` for OpenSubtitles search. |
| `media-queries.ts` / `query-keys.ts` | Remove `episodeId` from query keys and fetch functions. |

### Step 8 — Tests (5 files)

- `db.test.ts`: Remove `episodesDb` test suite, add episode operations on `mediaDb`
- `media.test.ts`: Remove episodes table DDL, update test helpers, rewrite "Episodes Database Module" describe block
- `transcoder.test.ts`: Update mocks to use `mediaDb` instead of `episodesDb`
- `stream-route.test.ts`: Remove `episodeId` test cases, add episode media ID tests
- `streaming.test.ts`: Same pattern — test with episode media IDs directly

### Step 9 — Cleanup

- Remove `episodes` from schema export object
- Remove all `Episode`/`NewEpisode`/`EpisodeStatus` imports across codebase
- Update `ARCHITECTURE.md` documentation
- Run full test suite, fix any remaining references
- Run `drizzle-kit generate` to verify migration is clean

---

## Data Flow After Migration

### Adding a Movie

```
User adds a movie from browse
  └─► POST /api/media
        ├─ Create media row (type='movie', magnetLink, infohash, status='pending')
        ├─ Create downloads row (mediaId → movie)
        └─ startDownload(movieMediaId, magnetLink)
             └─ On complete: media.filePath, media.status='complete'
```

### Adding a TV Season (per-episode, from TV_SEASON_OVERHAUL)

```
User clicks "Add Season 2" on a TorrentCard
  └─► POST /api/media/add-season
        ├─ Upsert media row (type='show', no magnetLink, no status)
        ├─ Upsert seasons row
        ├─ Create N media rows (type='episode', parentId → show, seasonId → season, status='pending')
        └─ Return { showId, seasonId, episodeCount, status: 'queued' }
             └─ [background] queueEpisodeSearches()
                  for each episode media row (3 at a time):
                    ├─ media.status → 'searching'
                    ├─ findBestEpisodeTorrent(imdbId, S, E)
                    ├─ if found:
                    │    media.magnetLink = magnet
                    │    media.infohash = infohash
                    │    downloads.create(mediaId → episode, magnet)
                    │    startDownload(episodeMediaId, magnet)
                    │    media.status → 'downloading'
                    └─ if not found:
                         media.status → 'not_found'
```

### Streaming

```
# Movie
GET /api/media/{movieId}/stream → resolves media.filePath

# Episode
GET /api/media/{episodeId}/stream → resolves media.filePath (same logic, no branching)
```

### Continue Watching

```sql
SELECT * FROM media
WHERE organizationId = ?
  AND playPosition > 0
  AND type IN ('movie', 'episode')
ORDER BY lastPlayedAt DESC
LIMIT 20
```

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Data loss during migration | Migration script tested against a copy of production DB first. Shadow restore point before running. |
| Broken streaming for existing TV content | Episode media rows get the same `filePath`/`fileIndex` data from old episodes table. Streaming logic simplified — no branching. |
| Subtitle orphaning | Migration explicitly updates `subtitles.mediaId` to point to new episode media rows before dropping `episodeId` column. |
| Play position loss | Episode `playPosition`/`playDuration` copied to new media rows during migration. |
| Test failures | Tests updated in the same PR. Full suite run before merge. |
| `type='tv'` → `type='show'` breakage | Global find-and-replace with test verification. |

---

## Relationship to TV_SEASON_OVERHAUL.md

This plan supersedes the schema portions of `TV_SEASON_OVERHAUL.md`. The per-episode download architecture described there (Phases 2-7) remains valid and becomes cleaner with the unified model:

- Phase 1 (schema changes) is replaced by this plan's schema
- Phase 2 (episode-downloader.ts) creates `media` rows with `type='episode'` instead of `episodes` rows
- Phase 3 (Prowlarr episode search) is unchanged
- Phase 4 (add-season route) creates episode media rows directly
- Phase 5 (torrent.ts changes) simplified — no `episodeId` parameter, episodes ARE media
- Phase 6 (frontend) simplified — no `?episodeId` URL params
- Phase 7 (cleanup) still needed for season-pack removal

The recommended order: implement this model overhaul first, then build the per-episode download system on top of the unified model.
