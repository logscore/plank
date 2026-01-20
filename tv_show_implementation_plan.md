# TV Show, Context Menu, and Blob Storage Implementation Plan

## Goal
Implement support for TV show seasons and episodes, update the playback UI with a context menu for episode selection, and implement a blob storage system for images.

## 1. Local Image Storage (File System)

We will store images (posters, backdrops) directly on the local file system to avoid hotlinking TMDB URLs and ensure offline availability.

### Architecture
- **Service**: `ImageStorageService`
  - `save(filename: string, data: Buffer | Blob): Promise<string>` (returns /uploads/filename.ext)
  - `delete(filename: string): Promise<void>`
- **Implementation**:
  - Stores files in `data/library/<uuid>/<image-filename>`.
  - Checks for existence to avoid re-downloading.
- **Integration**:
  - When fetching metadata from TMDB, download the image and save it to the `data/library/<uuid>/<image-filename>` directory.
  - Store the relative URL (e.g., `/data/library/<uuid>/<image-filename>`) in the database.
  - For posters name the file poster.ext and for backdrops name the file backdrop.ext

## 2. Database Schema Changes

We will extend the existing schema to support TV Series structure.

### `movies` table (Rename to `media`)
- Add `type`: `'movie' | 'tv'` (default 'movie')
- `title`, `overview`, `posterUrl`, `backdropUrl` remain shared.
- `magnetLink`, `infohash` remain as the "Source" of the files.
- `filePath` becomes the "Main File" for movies, or null for TV shows.

### New Table: `seasons`
- `id`: PK
- `movieId`: FK to `movies.id` (User's library item)
- `seasonNumber`: integer
- `name`: string
- `overview`: string
- `posterPath`: string (Blob URL)
- `airDate`: timestamp

### New Table: `episodes`
- `id`: PK
- `seasonId`: FK to `seasons.id`
- `episodeNumber`: integer
- `title`: string
- `overview`: string
- `stillPath`: string (Blob URL)
- `runtime`: integer
- `fileIndex`: integer (Index of the file in the torrent)
- `filePath`: string (Relative path in the torrent)

## 3. Backend Logic

### TMDB Integration (`src/lib/server/tmdb.ts`)
- Add `getTvDetails(id)` to fetch show info.
- Add `getSeasonDetails(tvId, seasonNumber)` to fetch episodes.
- Update `parseMagnet` or similar logic to detect if a magnet is likely a Series (using `parse-torrent-title`).

### Import Flow
1. User provides Magnet Link.
2. Server parses magnet (tries to detect Series vs Movie).
   - If User explicitly selects "TV Series" or auto-detection says TV:
     - Fetch Show Metadata.
     - Create `movies` (Type='tv').
     - Fetch Season/Episode metadata from TMDB.
     - Create `seasons` and `episodes` entries.
3. **File Mapping**:
   - When the Torrent Metadata is available (file list):
     - Iterate through files.
     - Match filenames (e.g., "S01E05") against the created `episodes` records.
     - Update `episodes` with `fileIndex` and `filePath`.

### Streaming (`src/routes/api/movies/[id]/stream/+server.ts`)
- Update endpoint to accept optional `?fileIndex=X` or `?episodeId=Y`.
- If `episodeId` is provided, look up `fileIndex`.
- Stream the specific file from the torrent.

## 4. Frontend Implementation

### UI Components
- **Context Menu Dropdown**:
  - Replace the single "Play" button with a Compound Component.
  - **Movies**: Click -> Play.
  - **TV Shows**: Click -> Open Context Menu -> List Seasons -> Click Season -> List Episodes -> Click Episode Play button -> Play.

### Movie Page (`src/routes/movie/[id]`)
- Update `data.movie` to include `seasons` and `episodes` (joined query).
- If `movie.type === 'tv'`:
  - Show "Select Episode" instead of direct "Play".
  - Implementing the cascading dropdown.

## 5. Implementation Steps

1.  **Setup File Storage**:
    - Create `src/lib/server/storage.ts`.
    - Ensure upload directory exists.
2.  **Schema Updates**:
    - Modify `src/lib/server/db/schema.ts`.
    - Run migrations.
3.  **Backend Logic**:
    - Update `tmdb.ts` for TV support.
    - Update `torrent.ts` to handle file mapping for episodes.
    - Update stream endpoint.
4.  **UI Updates**:
    - Create `EpisodeSelector` component (Dropdown).
    - Update `+page.svelte` to use it.
