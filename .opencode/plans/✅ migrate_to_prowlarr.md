# Implementation Plan - Migrate to Prowlarr

## Goal
Replace Jackett with Prowlarr for torrent indexing and searching. Prowlarr offers better integration, a modern UI, and improved indexer management.

## Proposed Changes

### 1. Database Schema
**File:** `src/lib/server/db/schema.ts`
- Rename `jackettUrl` to `prowlarrUrl`.
- Rename `jackettApiKey` to `prowlarrApiKey`.
- Rename `jackettTrustedGroups` to `prowlarrTrustedGroups`.
- Rename `jackettMinSeeders` to `prowlarrMinSeeders`.
- **Action:** Generate a new migration file using `drizzle-kit` to apply these column renames in the `configuration` table.

**File:** `docker-compose.yml`
- Remove the `jackett` service.
- Add the `prowlarr` service.
  - Image: `lscr.io/linuxserver/prowlarr:latest`
  - Port: Map `9696:9696`.
  - Volumes: Map `./data/prowlarr:/config` for persistence.

### 3. Backend Logic
**File:** `src/lib/server/prowlarr.ts` (New File)
- Create a new client library to replace `jackett.ts`.
- **API Client:**
  - Endpoint: `GET /api/v1/search` (Prowlarr's internal API is more robust than its Torznab feeds for aggregate search).
  - Parameters: `apikey`, `query`, `type=search` (or `tv`/`movie` with ID).
  - Response Mapping: Map Prowlarr's JSON response (camelCase fields like `magnetUrl`, `infoHash`, `title`) to the application's `IndexerResult` interface.
- **Functions to Implement:**
  - `searchProwlarr(query)`: Core search function.
  - `findBestTorrent(imdbId)`: Logic to find best release (filtering by quality, group, seeders).
  - `searchSeasonTorrent(...)`: Logic for season packs.

**File:** `src/lib/server/jackett.ts`
- **Action:** Delete this file after `prowlarr.ts` is verified.

**File:** `src/lib/server/settings.ts`
- Update `Settings` interface to use `prowlarr` keys.
- Update `getSettings` and `updateSettings` logic to read/write the new database columns.

### 4. API Endpoints & Routes
**File:** `src/routes/api/jackett/status/+server.ts`
- Rename to `src/routes/api/prowlarr/status/+server.ts`.
- Update connectivity check to ping Prowlarr (e.g., `GET /api/v1/system/status` or a simple search).

**File:** `src/routes/api/browse/resolve/+server.ts`
- Update imports to use `prowlarr.ts`.

### 5. Frontend/UI Updates
**File:** `src/routes/(app)/settings/+page.svelte` & `+page.server.ts`
- Update form fields:
  - `jackettUrl` -> `prowlarrUrl`
  - `jackettApiKey` -> `prowlarrApiKey`
  - Label changes: "Jackett" -> "Prowlarr".
- Update validation and form handling logic.

**File:** `src/routes/(app)/browse/+page.svelte` & `+page.server.ts`
- Update the "First Run/Setup" check to look for Prowlarr configuration.
- Update the connectivity status indicator.

### 6. Testing
- Create `src/tests/prowlarr.test.ts` adapting existing Jackett tests.
- Mock Prowlarr API responses (JSON array structure) instead of Jackett's `{ Results: [] }` structure.

## Verification Steps
1.  **Docker:** Verify Prowlarr starts and is accessible at `http://localhost:9696`.
2.  **Config:** Verify settings can be saved in the UI.
3.  **Connectivity:** Verify the "Status" endpoint reports success.
4.  **Search:** Verify searching for a movie (e.g., "The Matrix") returns results from configured Prowlarr indexers.
5.  **Resolve:** Verify clicking "Play" successfully resolves a magnet link.
