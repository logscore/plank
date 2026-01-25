# Codebase Refactoring & Improvement Plan

This document outlines areas of the codebase identified for refactoring, consolidation, and simplification. The goal is to improve maintainability, reduce code duplication, and better separate concerns.

## 1. High Priority: Consolidate Streaming Logic

The streaming implementation is duplicated across movie and media endpoints.

*   **Identified Issue:** `src/routes/api/media/[id]/stream/+server.ts` and `src/routes/api/movies/[id]/stream/+server.ts` contain nearly identical code (approx. 170 lines each) for:
    *   `checkDownloadError`
    *   `ensureVideoReady`
    *   `createTransmuxResponse`
    *   `handleRangeRequest`
    *   Request handling logic.
*   **Proposed Solution:**
    *   Merge the routes into a single `api/media/[id]/stream` endpoint.

## 2. High Priority: Decompose `torrent.ts`

`src/lib/server/torrent.ts` is a monolithic file (>1600 lines) violating the Single Responsibility Principle.

*   **Identified Issue:** It handles downloading, file system operations, database updates, streaming, recovery, and metadata fetching all in one place.
*   **Proposed Solution:** Break it down into specialized modules:
    *   **`download-manager.ts`**: Handle WebTorrent client, active downloads map, and download lifecycle.
    *   **`library-manager.ts`**: Handle moving files to the library, file naming, and directory management.
    *   **`stream-manager.ts`**: Handle creating streams from torrents or local files (can be combined with the Streaming Service above).
    *   **`recovery-service.ts`**: Handle the startup recovery logic.
    *   **`file-matcher.ts`**: Extract `mapFilesToEpisodes` and `autoNumberFiles` heuristics.

## 3. Database Schema & Usage Consolidation

*   **Identified Issue:** The `media` table and `downloads` table have overlapping fields (`magnetLink`, `infohash`, `status`, `progress`). The `media` table seems to assume a 1:1 relationship with a torrent in some legacy fields, while `downloads` supports 1:N (needed for TV shows).
*   **Proposed Solution:**
    *   Fully migrate to using `downloads` table for all download tracking.
    *   Deprecate/Remove `status` and `progress` from `media` table in favor of derived status from `downloads`.
    *   Ensure `magnetLink` and `infohash` on `media` are treated as "origin" data only, not current state.

## 4. Rename & Refactor `transcoder.ts`

*   **Identified Issue:** `src/lib/server/transcoder.ts` is named `transcoder` but primarily acts as a "Library Scanner" or "Media Processor" that identifies files needing transcoding. It also has circular/tight coupling with `ffmpeg.ts`.
*   **Proposed Solution:**
    *   Rename to `src/lib/server/media-processor.ts` or `library-scanner.ts`.
    *   Consolidate logic for scanning movies and TV shows (very similar code) into a generic scanner.
    *   Use `ffmpeg.ts` consistently for format checking (remove hardcoded extension checks in the scanner).

## 5. Simplify Magnet Parsing

*   **Identified Issue:** `src/lib/server/magnet.ts` and `src/lib/server/torrent.ts` both contain logic for parsing magnet links. `torrent.ts` uses `parse-torrent` and also imports `parseMagnet` from `magnet.ts`.
*   **Proposed Solution:**
    *   Consolidate all magnet parsing logic into `magnet.ts`.
    *   Ensure `torrent.ts` uses `magnet.ts` as the single source of truth for extracting infohashes and names.

## 6. TMDB & Metadata Separation

*   **Identified Issue:** `torrent.ts` contains `fetchAndUpdateMetadata` which calls into `tmdb.ts`.
*   **Proposed Solution:**
    *   Move `fetchAndUpdateMetadata` logic into a dedicated `metadata-service.ts` or strictly within `tmdb.ts`.
    *   Decouple torrent completion from metadata fetching where possible (e.g. via event bus or explicit service call).

## 7. Service Layer for Media Operations

*   **Identified Issue:** `src/routes/api/media/+server.ts` contains business logic for checking existing downloads, creating DB records, and starting downloads. This overlaps with logic that might be needed elsewhere (e.g. in `recoverDownloads`).
*   **Proposed Solution:**
    *   Create a `MediaService` to handle "Add Media" operations.
    *   This service should handle the checks for existing infohashes, database creation/updates, and initiating the download manager.

## 8. Clarify Caching vs. Engine

*   **Identified Issue:** `src/lib/server/torrent-cache.ts` handles caching of Jackett results for the Browse API, while `src/lib/server/torrent.ts` handles the actual downloading engine. The naming is slightly ambiguous.
*   **Proposed Solution:**
    *   Rename `torrent-cache.ts` to `discovery-cache.ts` or similar to clearly distinguish it from the active download engine.

## 9. Data Fetching Inconsistencies (TanStack Query)

*   **Identified Issue:**
    *   `src/routes/(app)/movie/[id]/+page.svelte` uses raw `fetch` for mutations (Retry, Delete) instead of the existing `media-mutations`.
    *   `src/routes/(app)/browse/+page.svelte` implements manual caching (Maps/Promises) for seasons and magnets instead of using `useQuery`.
    *   `src/lib/queries/media-queries.ts` exports raw fetch functions instead of query hooks.
    *   Several pages (`search`, `watch`) use raw `fetch` where queries/mutations would provide better state management.
*   **Proposed Solution:**
    *   Migrate all client-side `fetch` calls to TanStack Query hooks.
    *   Convert `browse/+page.svelte` manual caching to `useQuery` (e.g., `useSeasonsQuery`).
    *   Use centralized mutations (`media-mutations.ts`) in the detail pages to ensure cache invalidation works correctly.

## 10. Logging & Error Handling

*   **Identified Issue:**
    *   `console.error` is used pervasively for error logging, which is hard to track in production.
    *   API endpoints often swallow errors (e.g., TMDB failures return empty arrays) or duplicate error response logic.
*   **Proposed Solution:**
    *   Implement a structured `Logger` service.
    *   Standardize API error responses (e.g., `throw APIError(status, message, code)`).

## 11. Server Library Organization

*   **Identified Issue:** `src/lib/server` is becoming crowded (12+ files).
*   **Proposed Solution:**
    *   Group related files into subdirectories:
        *   `src/lib/server/media/` (`ffmpeg.ts`, `transcoder.ts`, `tmdb.ts`)
        *   `src/lib/server/download/` (`torrent.ts`, `magnet.ts`, `jackett.ts`)
        *   `src/lib/server/infra/` (`db.ts`, `storage.ts`, `auth.ts`)

## 12. Frontend Component Consolidation

*   **Identified Issue:**
    *   `MediaCard.svelte` and `TorrentCard.svelte` share significant visual structure (image container, overlays, mobile interaction logic, hover effects).
    *   Dropdown logic (click outside, positioning) is duplicated across `EpisodeSelector.svelte`, `ContextMenu.svelte`, and `MediaCard.svelte` (menus).
*   **Proposed Solution:**
    *   **Extract `PosterCard.svelte`**: Create a reusable component for the shared visual shell (image, hover overlay, mobile toggle). This will handle the "card" aspect while slots/props handle the specific actions (Play vs Add).
    *   **Generic `Popover` or `Dropdown`**: Create a standardized component to handle menu interactions, replacing the custom implementations in `EpisodeSelector` and `ContextMenu`.
    *   **Refactor Cards**: Update `MediaCard` and `TorrentCard` to compose these new shared primitives.

## 13. Caching Strategy Improvement

*   **Identified Issue:**
    *   **TMDB**: Zero caching implemented in `src/lib/server/tmdb.ts`. Every request hits the API, risking rate limits and slowing down the app.
    *   **Jackett**: Jackett has internal caching enabled (`"CacheEnabled": true`, `"CacheTtl": 2100`) so raw result caching is less critical, but we still cache the *decision* of which torrent to use.
    *   **Consistency**: Frontend uses a mix of `TanStack Query` and ad-hoc Map/Promise caching.
*   **Proposed Solution:**
    *   **Implement `TMDBCache`**: Add an in-memory (LRU) or Redis-based cache for TMDB responses in `src/lib/server/cache/tmdb-cache.ts`.
    *   **Discovery Cache**: Maintain `discovery-cache` (currently `torrent-cache`) to store the outcome of selection logic (IMDB ID -> Best Magnet Link) to avoid re-processing lists.
    *   **Standardize Frontend Caching**: Migrate ad-hoc Map caches in `browse/+page.svelte` to TanStack Query hooks with proper `staleTime`.

## Recommended Action Plan

1.  **Phase 1 (Immediate):** Refactor the API streaming endpoints to remove 150+ lines of duplicated code.
2.  **Phase 2:** Extract `PosterCard` and `Dropdown` components to clean up frontend duplication.
3.  **Phase 3:** Extract `magnet.ts` logic and clean up `transcoder.ts` naming and duplication.
4.  **Phase 4:** Begin splitting `torrent.ts`, starting with moving Library/File operations to `library-manager.ts`.
5.  **Phase 5:** Complete `torrent.ts` refactor and Database schema cleanup.
6.  **Phase 6:** Standardize TanStack Query usage across the frontend.
7.  **Phase 7:** Implement Logger, Server Directory Reorganization, and TMDBCache.
