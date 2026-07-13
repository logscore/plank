# Show page: move data fetching to the server `load`

**Status:** planned, not implemented
**Scope:** `src/routes/(app)/show/[id]/` (2 files)
**Goal:** Remove the client-side data fetch on the show detail page and serve `media` + `seasons` from a SvelteKit server `load`, matching how the movie page already works. Keep live download updates.

---

## Why

The movie and show detail pages fetch data two different ways, which caused a visible inconsistency:

- **Movie** (`src/routes/(app)/movie/[id]/+page.server.ts`): server `load` calls `requireMediaAccess` → on no-access/not-found it `throw error(404)` → SvelteKit renders the standard **error page**.
- **Show** (`src/routes/(app)/show/[id]/`): no data `load`. `+page.svelte` fetches `/api/media/[id]` and `/api/media/[id]/seasons` **client-side**. A 404 response just leaves `media = null`, so the page renders inline **"Show not found"** text instead of the error page.

A server `load` was already added to gate access (`requireMediaAccess`), but the client still fetches the data separately. This plan finishes the job: one server load provides all data, the client stops fetching, behavior becomes consistent with the movie page.

This is a **surgical** change — the large markup block in `+page.svelte` is untouched because we keep the local names `media`/`seasons` (as derived aliases of `data`).

---

## Background an executor needs

**Auth/data model:** every media row is org-scoped. `requireMediaAccess(locals, id)` (in `src/lib/server/api-guard.ts`) returns `{ userId, organizationId, mediaItem }`, throwing `error(403)` if no active org and `error(404)` if the media isn't in the caller's org. `locals` is populated once in `src/hooks.server.ts` from the better-auth session; `/show/**` is an app route, so the hook already guarantees an authenticated user with an active org before `load` runs.

**Seasons shape:** the existing endpoint `src/routes/api/media/[id]/seasons/+server.ts` builds the exact structure the page needs:
```ts
const seasons = seasonsDb.getByMediaId(id).map((season) => ({
  ...season,
  episodes: mediaDb.getEpisodesBySeasonId(season.id),
}));
```
Type: `SeasonWithEpisodes[]` = `Season & { episodes: Media[] }` (`src/lib/types.ts:56`).

**Live updates:** the show page polls every 5s while any episode is `searching`/`downloading`, and refreshes after episode retry/delete actions. Today it does this by re-running the client fetch (`loadShow(false)`). After this change, use `invalidateAll()` from `$app/navigation` to re-run the server `load`. This is the app's existing convention (see `src/routes/(app)/account/+page.svelte`, `src/routes/(app)/profiles/manage/+page.svelte`).

**Serialization note:** SvelteKit `load` returns real `Date` objects (via devalue); the old client JSON fetch returned date strings. Verified safe: `airDate` is a `string` (rendered raw); only `addedAt`/`lastPlayedAt` go through `formatDate()`, which does `new Date(...)` and handles both.

**Decision (confirmed):** the old client `GET /api/media/[id]` had a side effect — `mediaDb.updateLastPlayed(id)` (`src/routes/api/media/[id]/+server.ts:10`). We **drop** it. The movie page's load doesn't bump `lastPlayed` on view either, so this makes show/movie consistent (only actual playback updates `lastPlayedAt`).

---

## Step 1 — Replace the server load with a data load

File: `src/routes/(app)/show/[id]/+page.server.ts` (currently a gate-only load; replace entirely).

```ts
import { error } from "@sveltejs/kit";
import { requireMediaAccess } from "$lib/server/api-guard";
import { mediaDb, seasonsDb } from "$lib/server/db";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);
	if (mediaItem.type !== "show") {
		throw error(404, "Show not found");
	}
	const seasons = seasonsDb.getByMediaId(params.id).map((season) => ({
		...season,
		episodes: mediaDb.getEpisodesBySeasonId(season.id),
	}));
	return { media: mediaItem, seasons };
};
```

Notes:
- Mirrors the seasons endpoint logic exactly.
- The `type !== "show"` guard also fixes a latent bug where `/show/<movieId>` would render the show template for a non-show.

---

## Step 2 — Refactor `+page.svelte` to consume `data`

File: `src/routes/(app)/show/[id]/+page.svelte`. Targeted edits only:

1. **Imports**
   - Add `invalidateAll` to the existing `$app/navigation` import (currently `import { goto, replaceState } from "$app/navigation";`).
   - Add `import type { PageData } from "./$types";`.

2. **Props + derived data** (replace the `media`/`seasons`/`loading` state declarations near the top of `<script>`):
   ```ts
   let { data } = $props<{ data: PageData }>();
   const media = $derived(data.media);
   const seasons = $derived(data.seasons);
   ```
   - Remove `let loading = $state(true);`.
   - Change season selection init to read the URL once:
     ```ts
     let selectedSeason = $state<number | null>(getSelectedSeasonFromUrl());
     ```
     (`getSelectedSeasonFromUrl` is a hoisted function declaration, so it's callable here.)

3. **Delete `loadShow`** entirely (the async function that fetched `/api/media/[id]` and `/api/media/[id]/seasons`).

4. **`currentSeason`** derived — add a fallback so a missing/invalid selection still resolves:
   ```ts
   const currentSeason = $derived(
     seasons.find((s) => s.seasonNumber === selectedSeason) ?? seasons[0]
   );
   ```
   Season-tab active state should compare against `currentSeason?.seasonNumber` instead of `selectedSeason` so highlighting stays correct when falling back.

5. **`runEpisodeRetry`** — replace `await loadShow(false);` with `await invalidateAll();`.

6. **Effects**
   - Remove the initial `$effect(() => { loadShow(); });` (data now comes from `load`).
   - In the polling `$effect` (runs while episodes are `searching`/`downloading`), replace `loadShow(false)` with `invalidateAll()`.

7. **Template**
   - Remove the `{#if loading}` spinner branch and the trailing `{:else}` "Show not found" block. `media`/`seasons` are guaranteed by `load`, so render the content directly.
   - All other markup referencing `media` / `seasons` / `currentSeason` stays unchanged.

---

## Net effect

- Client no longer calls `/api/media/[id]` or `/api/media/[id]/seasons`; both come from a single server `load`.
- Access denied / not found / wrong type all resolve server-side to the standard error page (consistent with the movie page).
- Live updates preserved via `invalidateAll()` polling and post-action refresh (matches app convention).
- `+page.svelte` diff stays small because `media`/`seasons` remain the local names used throughout the markup.

The API endpoints (`/api/media/[id]`, `/api/media/[id]/seasons`) are left in place — they may still be used elsewhere (e.g. episode retry/delete flows fetch other endpoints). Do not remove them as part of this change without checking consumers.

---

## Verification

1. `npx svelte-kit sync && npx tsc --noEmit -p tsconfig.json` — clean.
2. `npx biome check src/routes/(app)/show/[id]` — clean.
3. Manual:
   - Open a show you have access to → renders (no spinner-then-content flicker; SSR data).
   - Open a show id in another org (or a bogus id) → **error page** (not inline text).
   - Open `/show/<movieId>` → error page (type guard).
   - Start/have an episode downloading → statuses refresh every ~5s without a manual reload.
   - Retry / delete an episode → list refreshes.
   - Switch season tabs and reload with `?s=<n>` → correct season selected.
