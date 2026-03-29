<!-- Implementation plan for metadata-first episodic season downloads and naming workflow -->
<!-- FEATURE: Browse season ingestion and per-episode acquisition architecture plan document -->
# TV Episode Download Implementation Plan

## Goal

When a user adds a season from browse, the server should:

1. upsert the show container
2. fetch TMDB metadata for the selected season
3. persist the season and aired episode rows immediately
4. save show artwork locally
5. search Prowlarr for each episode by episode IMDb id only
6. start each episode as its own torrent or magnet download
7. expose per-episode status and retry controls in the UI
8. finalize files with deterministic names

This replaces the old season-pack-first flow.

---

## Locked Product Decisions

- Add the selected season only.
- Create aired episodes only.
- Search Prowlarr by episode IMDb id only.
- If an episode has no IMDb id, mark it `not_found` immediately.
- If Prowlarr returns no usable result, mark it `not_found`.
- Queue episode jobs at `3` concurrent downloads per season.
- Re-adding a season fills missing episodes only.
- Save show poster and backdrop to the filesystem.
- Keep season posters and episode still images as TMDB URLs in the database for v1.
- First UI pass shows episode status and retry.
- Movie library filenames use `Title (Year).ext`.
- Episode library filenames use `Show Title - S01E01 - Episode Title.ext`.

---

## Current State

The unified `media` model is already strong enough for this feature.

### What already works

- `media.type` supports `movie`, `show`, and `episode`.
- Episode rows already store `parentId`, `seasonId`, `seasonNumber`, `episodeNumber`, and `displayOrder`.
- Episode rows already store `tmdbId`, `imdbId`, `stillPath`, `magnetLink`, `infohash`, `status`, `filePath`, `fileSize`, and `downloadedBytes`.
- `downloads.mediaId` can already point at a movie or an episode.
- Show rows already act as container rows.
- Existing retry, stream, subtitle, and progress flows already operate on `mediaId`.

### What still blocks the feature

- Season hydration currently creates basic episodes but does not fetch episode external ids.
- Browse still adds shows by resolving season packs instead of queueing per-episode acquisition.
- Torrent ownership still assumes most episode activity belongs to the parent show.
- Library finalization still keeps torrent filenames instead of deterministic names.
- Show delete, cancel, and recovery do not fully account for episode-owned downloads.

So the schema is not the blocker. The remaining work is orchestration and lifecycle cleanup.

---

## Chosen API Design

We are keeping the add flow singular.

### Public write endpoints

- `POST /api/media`
- `POST /api/media/[id]/retry`

`POST /api/media` becomes the single add-or-queue entrypoint.

It should not hold business logic directly. It should be a thin dispatcher over shared services.

### Why this is the chosen shape

This keeps the public add flow simple while still avoiding duplicated movie versus episode logic.

The key idea is:

- one public add endpoint
- multiple typed modes
- shared backend services
- one existing retry endpoint for item-specific recovery

The route stays elegant if it only validates the request, switches on `mode`, and delegates immediately.

### `POST /api/media` request shapes

```ts
export type CreateMediaRequest =
  | {
      mode: 'magnet'
      magnetLink: string
      type?: 'movie' | 'show'
      title?: string
      year?: number | null
      tmdbId?: number
      posterUrl?: string | null
      backdropUrl?: string | null
      overview?: string | null
      genres?: string[] | null
      certification?: string | null
    }
  | {
      mode: 'browse-season'
      tmdbId: number
      seasonNumber: number
      title: string
      year?: number | null
      posterUrl?: string | null
      backdropUrl?: string | null
      overview?: string | null
      genres?: string[] | null
      certification?: string | null
    }
```

### `POST /api/media` response shapes

```ts
export type CreateMediaResponse =
  | Media
  | {
      mode: 'browse-season'
      status: 'queued'
      showId: string
      seasonId: string
      seasonNumber: number
      episodeCount: number
    }
```

### Route handler shape

```ts
switch (body.mode) {
  case 'magnet':
    return createFromMagnet(body)
  case 'browse-season':
    return addSeasonFromBrowse(body)
}
```

### Route design constraints

This singular endpoint only stays clean if it follows these rules:

- thin route dispatcher only
- all business logic extracted into services
- strongly typed `mode` discrimination
- small per-mode validators
- no giant branch-heavy route file

The shared service architecture below stays the same. Only the public route surface changes.

---

## Shared Backend Architecture

The key design idea is:

- shows and seasons are orchestration containers
- movies and episodes share the same single-item acquisition pipeline

### Shared single-item acquisition service

New service responsibility:

1. accept a target `mediaId`
2. look up the media row
3. validate `imdbId`
4. check cached torrent by IMDb id
5. search Prowlarr if cache misses
6. persist `magnetLink` and `infohash`
7. create a `downloads` row
8. start the torrent

Movies use this once.

Episodes use this once per episode.

### Season orchestration service

Separate service responsibility:

1. upsert or reuse the show row
2. sync the selected season from TMDB
3. upsert aired episode rows only
4. queue eligible episodes through the shared single-item acquisition service
5. limit concurrency to `3`
6. skip complete or already active episodes

### Shared naming service

A single naming layer should be used by:

- movie library finalization
- episode library finalization
- recovery finalization
- any future subtitle sidecar renaming

This keeps final paths deterministic regardless of torrent source names.

---

## Recommended Services

### `season-sync`

Responsibilities:

- fetch show details from TMDB when needed
- fetch season details
- fetch per-episode external ids
- filter to aired episodes only
- create or update the season row
- create or update episode rows by stable identity

Episode metadata to persist:

- `tmdbId`
- `imdbId`
- `title`
- `overview`
- `runtime`
- `airDate`
- `stillPath`
- `seasonNumber`
- `episodeNumber`
- `displayOrder`

### `media-acquisition`

Responsibilities:

- `acquireMediaByImdb(mediaId)`
- `startMediaDownload(mediaId, magnetLink)`
- unify movie and episode acquisition logic
- centralize `not_found`, `error`, and duplicate handling

### `media-naming`

Responsibilities:

- sanitize filenames
- generate movie filenames from DB metadata
- generate episode filenames from show plus episode metadata
- preserve original extension before transmux

---

## TMDB Sync Plan

### Season sync behavior

When a season is added:

- fetch show details if the show does not exist yet
- upsert the show by `organizationId + tmdbId + type='show'`
- save show artwork using the existing image pipeline
- fetch season details from TMDB
- fetch episode external ids for each aired episode
- create or update episode rows

### Aired-only rule

An episode is eligible if:

- `airDate` is present
- `airDate <= today`

Unaired episodes are not created in v1.

### Re-add rule

Re-adding the same season should:

- reuse the same show row
- reuse the same season row
- update changed metadata on existing episodes
- create only missing episode rows
- queue only missing or failed episodes that are eligible for rework

---

## Prowlarr Search Plan

### Search input

Use episode IMDb id only.

### Search result handling

- if no IMDb id exists, mark `not_found`
- if no result exists, mark `not_found`
- if the best result is HTTP, resolve to a magnet before saving
- save `magnetLink` and `infohash` to the target media row
- create a `downloads` row
- start the torrent

### Episode-specific filtering

Even though search input is IMDb only, episode acquisition should still be allowed to reject obvious bad matches such as:

- full-season packs
- complete-series packs
- multi-episode releases when we want a single episode

That filter should be optional so the movie path can reuse the same acquisition service.

---

## Torrent Ownership Refactor

Current torrent behavior is still optimized for show-owned season packs.

That needs to change.

### Direct episode rule

If an episode row has its own `magnetLink` and `infohash`, the episode owns that download.

### Season-pack fallback rule

Only pack-based episode playback should fall back to parent-show ownership.

### Areas that must be updated

- active download lookup
- stream resolution
- progress resolution
- wait-for-ready logic
- cancel logic
- delete logic
- recovery logic

The movie path should become the default single-file path for both movies and direct episode torrents.

---

## Library Naming Plan

### Movie naming

Format:

- `Title (Year).ext`
- fallback: `Title.ext`

Examples:

- `Alien (1979).mkv`
- `The Social Network (2010).mp4`
- `Unknown Movie.mp4`

### Episode naming

Format:

- `Show Title - S01E01 - Episode Title.ext`

Examples:

- `Breaking Bad - S01E01 - Pilot.mkv`
- `Severance - S02E03 - Who Is Alive?.mp4`

### Rules

- use metadata values from the DB, not the torrent filename
- sanitize invalid filesystem characters
- collapse duplicate whitespace
- trim trailing spaces and periods
- preserve the original extension until transmux changes it to `.mp4`

### Library destinations

Movies:

- `library/<movieId>/Title (Year).ext`

Episodes:

- `library/<showId>/Season 01/Show Title - S01E01 - Episode Title.ext`

---

## Retry Plan

Reuse the existing retry route:

- `POST /api/media/[id]/retry`

### Retry behavior

If the row already has a magnet:

- reset file state
- restart the download

If the row has no magnet but does have an IMDb id:

- reset state
- rerun acquisition through the shared IMDb flow

If the row has neither:

- return a clear failure message
- keep the item in `not_found`

This keeps one retry endpoint for movies and episodes.

---

## Delete and Recovery Plan

### Delete behavior

Deleting a show must also:

- cancel direct episode downloads
- remove child episode temp directories
- remove the parent show library directory
- allow child episode rows to cascade via foreign keys

### Recovery behavior

Recovery must stop assuming every incomplete row already has a magnet.

For incomplete episodes:

- if a library file exists, mark complete
- if temp data exists, finalize using deterministic naming
- if a magnet exists, restart download
- if no magnet exists but an IMDb id exists, rerun acquisition
- otherwise mark `not_found`

---

## UI Plan

### Browse page

Replace the season-pack flow with metadata-first add season behavior.

User action:

- click `Add Season`
- call `POST /api/media` with `mode: 'browse-season'`
- show success toast when the season is queued

The browse page should stop prefetching season pack magnets.

### Show page

Episode cards should surface:

- `searching`
- `downloading`
- `complete`
- `error`
- `not_found`

The first pass should add:

- a retry action for `error` and `not_found`
- play enabled only when the file exists or the episode is fully ready
- automatic refresh while any episode is active

### Episode selector

Episode availability should stop depending only on `fileIndex`.

It should treat an episode as available when:

- `status === 'complete'`
- or `filePath` exists

---

## Database Adjustments

No new tables are required.

Recommended additions:

- one unique episode identity index, ideally on `(parentId, seasonNumber, episodeNumber)` for `type='episode'`
- one or more DB helpers for episode lookup and upsert by stable identity

That keeps season re-add idempotent and prevents duplicate episode rows.

---

## Tests To Add

### TMDB sync

- stores episode metadata including episode IMDb id
- skips unaired episodes
- updates existing episodes without duplication

### Acquisition

- missing IMDb id becomes `not_found`
- no Prowlarr result becomes `not_found`
- resolved episode creates `downloads` row and starts download

### Torrent behavior

- direct episode download owns its own torrent state
- season-pack fallback still works for existing pack-based flows
- retry works for magnet-backed and IMDb-backed paths
- show delete cancels child episode downloads
- recovery reacquires episodes without magnets when possible

### Naming

- movie files finalize to `Title (Year).ext`
- episodes finalize to `Show Title - S01E01 - Episode Title.ext`
- transmux preserves the renamed basename

### UI

- browse season add calls `POST /api/media` with `mode: 'browse-season'`
- show page displays episode states and retry actions

---

## Build Order

1. add episode identity helpers and migration
2. add shared naming service
3. extract shared media acquisition service
4. extract TMDB season sync service with episode external ids
5. refactor `POST /api/media` into a typed mode dispatcher and add `browse-season`
6. refactor torrent ownership for direct episode downloads
7. extend the existing retry route
8. update browse UI to use metadata-first season adds
9. update show UI with status and retry controls
10. add recovery, delete, and naming tests

---

## Recommendation Summary

The chosen design is a singular add endpoint implemented as a typed dispatcher over shared services.

Specifically:

- `POST /api/media` handles `mode: 'magnet'` and `mode: 'browse-season'`
- shared backend services
- `POST /api/media/[id]/retry` stays as the item-scoped retry control

That keeps the external API compact while still avoiding duplicated movie versus episode logic.
