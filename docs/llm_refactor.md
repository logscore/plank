# Plank — Architectural Reset

*Scope reviewed: 159 source files, ~24k LOC. Reviewed directly: the whole `lib/server` surface, the client data layer, hooks, auth, DB layer, and ~10 representative routes. Tests ignored as a safety net per your instruction.*

---

## Executive summary

Plank is **not an over-abstracted enterprise mess** — it has very few "clean architecture" sins (no DI container, no event bus, no repository-interface-per-entity ceremony). The `mediaDb` repository, `api-guard`, and the DB schema are genuinely fine. So I'm *not* going to tell you to rip out layers wholesale.

The actual disease is different and matches exactly what you said: **the codebase is illegible because the same job is done two or three different ways, and a handful of files have become god-modules.** A newcomer (or you, six weeks later) can't form a mental model because there's no single answer to "how do I fetch data?", "where does config come from?", or "where does a download actually happen?".

Concretely, the legibility problem is four inconsistencies, not four hundred bad abstractions:

1. **Two data-fetching styles** (TanStack wrappers vs. raw `fetch`) — pick one.
2. **Two config sources** (env `config` vs. DB `getSettings`) — pick one.
3. **Three image-saving paths** and **two path-building modules** — merge.
4. **Three god-files** (`torrent.ts` 1763, `prowlarr.ts` 1087, the `media` POST handler 300) that hide the real logic — split along obvious seams.

Fix those and the file count drops, the "I don't know this codebase" feeling mostly evaporates, and you haven't introduced a single new abstraction. You also close two real multi-tenant access holes along the way.

---

## Top architectural problems

**P1 — The client data layer is a boundary that nobody respects.**
`lib/queries/*` (6 files, 601 LOC) + `lib/mutations/*` (3 files, 370 LOC) + `query-keys.ts` + `query-client.ts` + `fetch-error.ts` + `prefetch.ts` define 12 `createQuery` and 12 `createMutation` wrappers. Yet there are **21 raw `fetch('/api/...')` calls in 11 `.svelte` files** that skip the whole thing. So a reader has to learn *both* systems and guess which applies where. This is the #1 driver of your "I don't understand it" pain. An abstraction bypassed half the time isn't a boundary, it's tax.

**P2 — `torrent.ts` is a 1763-line god-module.** Nine exports (`torrent.ts:513,1251,1415,1450,1457,1494,1519,1551,1748`) sit on top of webtorrent client management, magnet/tracker config, SxxExx episode-to-file mapping (`torrent.ts:179-180,277,319,337`), download orchestration, progress polling via `setInterval` (`torrent.ts:615`), range-request streaming, recovery, and deletion — plus direct DB writes throughout. It's the file you're afraid to touch, and that fear is rational: everything is entangled with module-level mutable maps (`activeDownloads`/`pendingDownloads`, `torrent.ts:96,99`) and a singleton `client` (`torrent.ts:157`).

**P3 — Business logic lives inside HTTP handlers.** `routes/api/media/+server.ts` is 364 lines: the `POST` (`:257-364`) does magnet parsing, type detection, dedup, show-merge, TMDB metadata resolution, DB creation, background image saving, and download kickoff via eight in-file helper functions (`:51-255`). None of it is reusable or testable outside an HTTP request. The route *is* the domain layer here.

**P4 — Configuration has two sources of truth.** Env-based `config` (`lib/config.ts`) and DB-backed `getSettings()` (`lib/server/settings.ts`) coexist. `prowlarr.ts`/`tmdb.ts` use `getSettings`; `torrent.ts`/`subtitles.ts`/`library-paths.ts`/`scheduler.ts`/`storage.ts` use env `config`; `opensubtitles.ts` uses **both**. This is a genuine correctness trap (change a key in the settings UI, and half the app ignores it) *and* a legibility trap.

**P5 — Helper-file fragmentation.** `progress-status.ts` is a 6-line file with one function (`:4`); `fetch-error.ts` is 9 lines; `magnet.ts` exports one function; `utils.ts` is 16 lines. Image saving is spread across `storage.ts` (a stateless `ImageStorageService` class + singleton), `image-processing.ts`, and `tmdb.ts:saveTmdbImages`. Path/name building is split between `library-paths.ts` and `media-naming.ts`. This is your "too many helpers" complaint, literally.

**P6 — Access control is copy-pasted, and leaks.** `api-guard.ts` provides exactly the right small helpers (`requireAuth`, `requireMediaAccess`), but only 12 of 33 routes use them. Several others **re-implement the identical 8-line auth+org block by hand** (`media/search/+server.ts:8-15`, `media/[id]/episodes/reorder/+server.ts:6-12`, `media/[id]/seasons/[num]/+server.ts:7-13`). Worse, two handlers have a real cross-tenant IDOR: the subtitle routes fetch by `subtitleId` **without checking it belongs to `params.id`** (`subtitles/[subtitleId]/+server.ts:10,33,47`) — the `GET` only calls `requireAuth` and then reads an arbitrary subtitle file off disk; `PATCH`/`DELETE` verify access to the *parent media* but not to the *subtitle*, so any user can default/delete another tenant's subtitle by id. Given "boundaries must hold," this matters.

**P7 — Premature concurrency machinery.** `transcoder.ts:12-28` defines a generic `runWithConcurrency` worker-pool... always called with `LIBRARY_SCAN_CONCURRENCY = 1` (`:8`). At concurrency 1 it's a `for` loop wearing a costume.

**Operational smell (you flagged the symptom):** `plank.db-wal` is **1.5 GB**. WAL is enabled (`db/index.ts:19`) but nothing ever checkpoints, and the connection is process-lifetime. That file will grow unbounded. Not architecture, but it'll bite a self-hoster.

---

## What to delete

| Target | Evidence | Why |
|---|---|---|
| `lib/progress-status.ts` | `:4`, 6 lines, 1 fn | Fold `isTerminalProgressStatus` into `media-progress.ts` (server) / inline in the SSE client. A file per function is the fragmentation you're complaining about. |
| `lib/queries/fetch-error.ts` | `:1-9` | Trivial; move into the one fetch helper you keep. |
| `transcoder.ts` `runWithConcurrency` | `:12-28` | Replace 3 call sites with a plain sequential loop. Reintroduce a pool only if you ever actually run concurrency > 1. |
| `storage.ts` `ImageStorageService` **class** | `:5-68` | Stateless class + singleton = 4 plain functions. Delete the class wrapper, keep the functions. |
| Dead `media` POST helper indirection | `media/+server.ts:51-255` | Not deleted outright — *relocated* (see "merge"). The route should not own these. |
| One of the two config systems' direct readers | P4 | Don't delete `config.ts`; delete the *habit* of importing it in 5 server modules (route everything through settings). |

I deliberately found **no large dead subsystems** to delete — this isn't a codebase bloated with unused frameworks. Run `knip` (already configured) for true dead exports; I saw candidates but won't assert without it.

---

## What to merge

| Merge these | Into | Rationale |
|---|---|---|
| `storage.ts` + `image-processing.ts` + `tmdb.ts:saveTmdbImages` + `media/+server.ts:saveImagesAsync` | **`lib/server/images.ts`** | Four places save images to disk (`storage.ts:21-52`, `image-processing.ts:48-78`, `tmdb.ts:664-700`, `media/+server.ts:153-173`). One module, a few functions: `saveImage`, `saveImageFromUrl`, `replaceImage`, `saveTmdbImages`. |
| `library-paths.ts` + `media-naming.ts` | **`lib/server/paths.ts`** | Both build library directory/file names from the same media fields. They're two halves of one concept. |
| `magnet.ts` (1 fn) | **`torrent/` module** (see below) | One-function file; belongs with torrent logic. |
| `query-keys.ts` + `query-client.ts` + `fetch-error.ts` + remaining query/mutation files | **`lib/data/`** (or co-located per page) | Collapse the 12-file client data layer to the minimum (see Target Architecture). |
| `media/+server.ts` POST orchestration | **`lib/server/media-library.ts`** (`addMediaFromMagnet`, `addSeasonFromBrowse` already exists in `season-sync.ts`) | Pull the domain logic out of the HTTP handler so the route becomes ~15 lines. |
| Env `config` defaults | **`settings.ts`** as the single accessor | `getSettings()` already falls back to env (`settings.ts:120-135`). Make that the *only* path; `config.ts` becomes raw env defaults consumed solely by `settings.ts` (plus `config.paths`, which is fine to keep separate). |

---

## What to simplify

- **Pick one data-fetching pattern (P1).** Recommendation, in priority order:
  - **Page reads → SvelteKit `load`.** Media detail, position, subtitle tracks, seasons, search-in-library are one-shot reads behind a page. `load()` deletes the route + fetch wrapper + query-key + `createQuery` quadruple-boilerplate for each.
  - **Keep TanStack Query *only* where it earns its keep:** optimistic library add/delete (`media-mutations.ts:62-132` is good code), the infinite browse grid, and progress. Everything TanStack stays in **one or two** feature files, not six.
  - **Kill the 21 raw `fetch` calls** by routing them through whichever of the two survivors fits. The rule a newcomer should be able to state in one sentence: *"page data comes from `load`; mutations and live/infinite data come from TanStack in `lib/data/`."*
- **Make all 33 handlers thin and uniform (P3, P6).** Every handler: `requireAuth`/`requireMediaAccess` → parse input → call one server function → `json(...)`. Replace the hand-rolled auth blocks with the guard. This simultaneously closes the IDOR (the guard becomes the only door) and deletes copy-paste.
- **Split `torrent.ts` along its existing seams (P2)** into a `torrent/` folder — *more files, but each legible*:
  - `torrent/client.ts` — webtorrent singleton, trackers, add/remove.
  - `torrent/download.ts` — `startDownload`, progress, recovery, cancel (`:513,1748,1519`).
  - `torrent/files.ts` — magnet parse + SxxExx episode-to-file mapping (`:179-337`, absorbs `magnet.ts`).
  - `torrent/stream.ts` — `getVideoStream` range logic (`:1251`).
  This is the one place I'm adding files on purpose: legibility of the scariest module beats raw file count.
- **Unify config (P4).** One function, `getSettings()`, used everywhere. Fix `torrent.ts`/`subtitles.ts`/`opensubtitles.ts`/`library-paths.ts` to read it.
- **Fix WAL growth.** Add `PRAGMA wal_autocheckpoint` or a periodic `wal_checkpoint(TRUNCATE)` (you already have `scheduler.ts` for periodic tasks — one more line there).

---

## Proposed target architecture

Same stack, same shape, fewer ways to do each thing. **No new patterns introduced.** SvelteKit already gives you the architecture; the job is to stop fighting it with a parallel client layer and to give the server domain logic a home outside route files.

```
Browser (Svelte 5 runes)
  │  page data  ──────────────► +page.server.ts  load()      ┐
  │  mutations / live / infinite ► lib/data/* (TanStack)       │ thin HTTP
  ▼                                                            ▼
routes/api/**/+server.ts   ← thin: guard → parse → call → json
  │
  ▼
lib/server/*  (the real app: torrent/, media-library, tmdb, prowlarr,
  │            opensubtitles, images, paths, settings, ffmpeg, transcoder)
  ▼
lib/server/db.ts  (mediaDb / seasonsDb / downloadsDb / subtitlesDb repos) — KEEP
  ▼
SQLite (single file) — KEEP
```

**Keep as-is (proven useful, don't churn):**
- `db.ts` repositories — explicit, org-scoped, boring in the good way. Keep.
- `db/schema.ts` + `db/index.ts` — you said schema's fine; agreed.
- `api-guard.ts` — correct minimal abstraction. *Use it everywhere* rather than changing it.
- `crypto.ts` + settings encryption — justified (real secrets at rest).
- `hooks.server.ts` session resolution — global session is the right place (`:78-96`).
- `facehash/` avatar generator — self-contained, ignore it.
- Auth/org/profile model — load-bearing for multi-user; keep entirely.

**One thing I'd push back on but leave to you:** the `downloads` table (`downloadsDb`, `db.ts:385-446`) largely mirrors `media.status/progress/infohash`. It earns its place only for shows (1 show : N season-pack magnets); for movies it's 1:1 redundant. You said the schema's fine, so I'm flagging, not mandating: consider whether `downloads` could be dropped for movies. Low priority.

---

## Folder / module structure (target)

```
src/lib/
  server/
    db.ts                 # repos (keep)
    db/{index,schema}.ts  # connection + schema (keep)
    auth.ts api-guard.ts  # keep; guard used by ALL routes
    settings.ts           # THE config accessor (absorbs env defaults)
    media-library.ts      # addMediaFromMagnet, addSeasonFromBrowse, retry  ← from media POST
    torrent/
      client.ts download.ts files.ts stream.ts   # ← split torrent.ts (+absorb magnet.ts)
    tmdb.ts prowlarr.ts opensubtitles.ts season-sync.ts   # integrations (read settings only)
    ffmpeg.ts transcoder.ts        # transcoder loses runWithConcurrency
    images.ts             # ← storage.ts + image-processing.ts + saveTmdbImages
    paths.ts              # ← library-paths.ts + media-naming.ts
    media-progress.ts subtitles.ts crypto.ts scheduler.ts
  data/                   # ← was queries/+mutations/+query-keys/+query-client/+prefetch
    client.ts             # QueryClient + the one fetch+error helper
    media.ts browse.ts prowlarr.ts   # only what truly needs TanStack
  config.ts               # raw env defaults (consumed by settings.ts) + paths
  types.ts utils.ts constants.ts auth-client.ts
```

`lib/server` goes from 22 files to ~16 *concepts* (torrent becomes a folder, but a navigable one). The client layer goes from ~12 files to ~4, with a one-sentence rule for which to use.

---

## Refactor plan (ordered: low-risk/high-impact first)

Each step is independently shippable. Behavior-change risk noted per step.

**Phase 0 — Safety net (do first, since tests are untrusted).** Before touching anything risky, write thin integration tests that hit the real endpoints for: add-magnet flow, media list (org scoping), stream range request, subtitle download, progress SSE. You don't need unit coverage — you need a tripwire that the *flows* still work. ~Half a day. *No behavior change.*

**Phase 1 — Free wins, zero behavior change.**
1. Delete `runWithConcurrency`; inline sequential loops (`transcoder.ts:73-102`).
2. Collapse `progress-status.ts` and `fetch-error.ts` into their consumers.
3. Demote `ImageStorageService` class to plain functions; merge image-saving into `images.ts`; merge `library-paths`+`media-naming` into `paths.ts`. *Pure moves — verify imports compile.*
4. Add WAL checkpointing to `scheduler.ts`. *Operational only.*

**Phase 2 — Close the access holes (small, security-relevant).**
5. Make every route use `requireAuth`/`requireMediaAccess`; delete the hand-rolled auth blocks.
6. Fix the subtitle IDOR: after fetching a subtitle, assert `subtitle.mediaId === params.id` (`subtitles/[subtitleId]/+server.ts`). ⚠️ *Behavior change for the intended-good case is none; it only rejects cross-tenant access.* Test before/after with two profiles.

**Phase 3 — Unify config (correctness + legibility).**
7. Route all integration modules through `getSettings()`; remove direct `config` imports from server modules except `config.paths`. ⚠️ *Behavior could change if a value currently comes from env but the DB row is stale/empty.* `getSettings` already falls back to env (`settings.ts:120-135`), so risk is low, but test the prowlarr/opensubtitles/tmdb paths with a fresh DB.

**Phase 4 — Pull domain logic out of routes.**
8. Extract `media/+server.ts` POST into `media-library.addMediaFromMagnet()`; route shrinks to parse+call. ⚠️ *Highest-value, medium risk* — this is the add flow. Phase 0 tests cover it. Watch the show-merge branch (`media/+server.ts:305-323`) and background image save.

**Phase 5 — Split `torrent.ts`.** Mechanical move into `torrent/` once Phase 0 tests exist. ⚠️ *Risk is import churn and the shared module-level maps* (`activeDownloads`/`pendingDownloads`) — those must live in `torrent/client.ts` or `download.ts` and be imported, not duplicated. Do this as pure cut-and-paste with no logic edits, in one commit, then verify streaming + recovery.

**Phase 6 — Consolidate the client data layer (biggest legibility win, do last).**
9. Move one-shot page reads to `+page.server.ts` `load`. Start with the simplest (media detail, position).
10. Collapse remaining TanStack into `lib/data/{media,browse,prowlarr}.ts`; delete the now-empty wrapper/key/prefetch files.
11. Replace the 21 raw component `fetch` calls with `load` data or the surviving `lib/data` functions. ⚠️ *Touches many components; do it page-by-page,* not in one mega-commit.

---

## Risks and tradeoffs

- **Splitting `torrent.ts` adds files.** This contradicts "fewer files" locally but serves the higher goal ("I understand my codebase"). A 1763-line entangled file is *less* legible than four named ones. I'd take the trade every time; if you disagree, the next-best is to leave it as one file but add section banners and pull out the pure functions (`files.ts`) only.
- **Moving reads to `load` vs. keeping TanStack** is the one judgment call. Tradeoff: `load` is simpler and SSR-friendly but loses client-side cache/optimism; TanStack keeps snappy UX but is the very indirection causing pain. My recommendation (load for reads, TanStack only for mutations/live/infinite) is the pragmatic middle, but it's a real product-feel decision — validate the browse/library snappiness after.
- **Config unification can surface latent bugs** where something silently depended on env over DB. That's a feature (you *want* one source), but it can change which API key is used on existing installs. Mitigate with the env fallback that already exists.
- **The IDOR fix and guard rollout** could, in theory, start returning 403/404 where sloppy clients previously got data. That's correct behavior, but test the happy paths so you don't break your own UI.
- **I did not deep-read every one of the 5 large page components** (`show/[id]` 885 LOC, `account` 815). They're probably the next legibility target after the server, but they're lower-risk and out of scope for an *architecture* reset. Flagging for a later pass.

---

## Final verdict (plain English)

Your instinct is right, but your diagnosis is slightly off. This isn't a codebase strangled by clever abstractions — it's a codebase that does ordinary things in **more than one way**, with **three oversized files** hiding the important logic. That's *why* it feels unknowable: there's no consistent path to follow.

So the fix is mostly **convergence, not deletion**. One way to fetch data. One source of config. One place that saves images. One door for auth. Three god-files broken along seams that already exist in the code. Do that and you'll lose ~10 files, close two tenant-isolation bugs, and — most importantly — be able to explain the whole system to a new contributor in five sentences.

Resist the urge to "modernize" beyond this. Don't add a service layer, don't add CQRS, don't add a job queue for the single-instance download flow, don't generalize the `downloads` table into an events table. The boring target above is the right one precisely because it's boring.

**Highest-leverage single move:** Phase 6 (collapse the client data layer to one obvious pattern). **Scariest, so gate it behind tests:** Phase 5 (`torrent.ts` split). **Do-it-today, no downside:** Phase 1 + the WAL checkpoint.
