# TMDB Image WebP Plan

## Goal
Reduce poster and backdrop storage size by preferring WebP for TMDB images while keeping current behavior safe.

## Current Behavior
- TMDB URLs are built in `src/lib/server/tmdb.ts` (example: `/w342/...jpg`, `/w780/...jpg`).
- Images are downloaded and stored as `poster.jpg` and `backdrop.jpg`.
- Saved files are served through `/images/[...path]` and that route already supports `.webp` content type.

## Findings
- TMDB image docs show URL format as `.../w500/<file_path>` where `file_path` includes extension.
- Directly changing URL extension to `.webp` is not reliable (tested URL returned `404`).
- Requesting the normal image URL with `Accept: image/webp` can return `Content-Type: image/webp`.

## Proposed Approach (Later)
1. Add a small image download helper used by `saveTmdbImages`.
2. Request TMDB image URLs with `Accept: image/webp,image/*;q=0.8,*/*;q=0.5`.
3. Inspect response `content-type`:
   - If `image/webp`: save as `.webp`.
   - Else: keep existing `.jpg` path for now (no conversion in phase 1).
4. Keep existing DB fields unchanged (`posterUrl`, `backdropUrl`) since they store URLs, not file format metadata.
5. Add basic logging counters to compare response formats over time.

## Optional Phase 2
- If TMDB often returns non-WebP for our requests, add Sharp conversion fallback:
  - Download image bytes.
  - Convert to WebP locally.
  - Save as `.webp`.
- Evaluate CPU impact before enabling globally.

## Test Plan
- Unit test `saveTmdbImages` for:
  - WebP response -> saves `.webp`.
  - Non-WebP response -> keeps `.jpg` in phase 1.
  - Download failure -> keeps original remote URLs unchanged.
- Manual check:
  - Add new media from browse/search.
  - Confirm stored file extension and served `Content-Type`.

## Rollout Notes
- No migration required for existing library images.
- New items can use WebP while old items stay as-is.
- Optional backfill can be done later with a one-off script if needed.
