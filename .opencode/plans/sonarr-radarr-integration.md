# Sonarr/Radarr Automation Integration

## Overview

Integrate Sonarr (TV) and Radarr (Movies) as optional Docker services that handle all automation logic — episode monitoring, quality upgrades, wishlisting, and scheduled searches. Plank bridges the gap by exposing a **qBittorrent-compatible API** so Sonarr/Radarr can send downloads to Plank's WebTorrent engine, preserving the real-time streaming capability.

**Key principle:** Do not reinvent Sonarr/Radarr's automation brain. Let them handle monitoring, scheduling, quality profiles, and search logic. Plank provides the UI, the download engine, and the library management.

### What Sonarr/Radarr Handle (NOT built in Plank)

| Feature | Service |
|---|---|
| Episode monitoring & air date tracking | Sonarr |
| RSS feed monitoring for new releases | Sonarr/Radarr via Prowlarr |
| Quality profiles, cutoffs, upgrade logic | Sonarr/Radarr |
| Wishlist / "wanted" list for unreleased movies | Radarr |
| Release group preferences / custom formats | Sonarr/Radarr |
| Smart search scheduling & backoff | Sonarr/Radarr |
| Indexer integration for automation | Prowlarr -> Sonarr/Radarr (native) |

### What Plank Builds

| Feature | Why |
|---|---|
| qBittorrent-compatible API layer | Bridge between Sonarr/Radarr and WebTorrent |
| Sonarr/Radarr API clients | Proxy their data into Plank's UI |
| Auto-setup orchestration | Zero-config Docker discovery + automatic wiring |
| Settings page redesign | Sidebar nav for growing settings sections |
| Deep UI integration | Monitoring toggles, quality badges, upcoming calendar |
| In-app notification system | Webhook receiver translates Sonarr/Radarr events to Plank notifications |
| Quality rollback via magnet link | 48-hour grace period with re-download from stored magnet |
| Library file management | Plank stays in control of `data/library/{uuid}/` folder structure |

---

## System Architecture

```
User
 │
 ▼
┌──────────────────────────────────────────────────────┐
│  Plank (SvelteKit)                                   │
│                                                      │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │ Settings  │  │ Browse    │  │ Media Detail     │  │
│  │ Page      │  │ Page      │  │ Page             │  │
│  │ (sidebar) │  │ +Sonarr/  │  │ +monitoring      │  │
│  │           │  │  Radarr   │  │ +quality history  │  │
│  │           │  │  actions  │  │ +rollback         │  │
│  └──────────┘  └───────────┘  └──────────────────┘  │
│        │              │               │              │
│        ▼              ▼               ▼              │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Plank API Layer                                │ │
│  │  /api/automation/*   (proxy to Sonarr/Radarr)   │ │
│  │  /api/media/*        (existing, unchanged)      │ │
│  │  /api/notifications/* (new)                     │ │
│  │  /api/v2/*           (qBit compat layer)   ◄────┼─── Sonarr/Radarr
│  │  /api/automation/webhook                   ◄────┼─── push downloads
│  └─────────────┬──────────────────┬────────────────┘ │  + webhooks here
│                │                  │                   │
│                ▼                  ▼                   │
│  ┌──────────────────┐  ┌──────────────────┐          │
│  │ Sonarr Client    │  │ Radarr Client    │          │
│  │ (sonarr.ts)      │  │ (radarr.ts)      │          │
│  └────────┬─────────┘  └────────┬─────────┘          │
│           │                     │                    │
│  ┌────────┴─────────────────────┴─────────┐          │
│  │           WebTorrent Engine            │          │
│  │     (streaming + downloading)          │          │
│  │     File mgmt: data/library/{uuid}/    │          │
│  └────────────────────────────────────────┘          │
│                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐  │
│  │  SQLite (Drizzle)    │  │  node-cron           │  │
│  │  +quality_history    │  │  +rollback cleanup   │  │
│  │  +notification       │  │  (existing jobs stay) │  │
│  │  +qbit_category      │  │                      │  │
│  │  +config additions   │  │                      │  │
│  └──────────────────────┘  └──────────────────────┘  │
└──────────────────────────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
    ┌─────────┐   ┌──────────┐   ┌──────────┐
    │ Sonarr  │   │ Radarr   │   │ Prowlarr │
    │ :8989   │   │ :7878    │   │ :9696    │
    └────┬────┘   └────┬─────┘   └────┬─────┘
         │             │              │
         └─────────────┴──────────────┘
              Prowlarr syncs indexers
              to both Sonarr and Radarr
```

---

## Phase 1: Docker Stack & Configuration

### 1.1 Update `docker/docker-compose.yml`

Add Sonarr and Radarr services alongside existing Prowlarr and FlareSolverr:

```yaml
sonarr:
  image: lscr.io/linuxserver/sonarr:latest
  container_name: sonarr
  environment:
    - PUID=1000
    - PGID=1000
    - TZ=${TZ:-America/New_York}
  volumes:
    - sonarr-config:/config
    - ${MEDIA_PATH:-./media}:/media
  ports:
    - "8989:8989"
  restart: unless-stopped
  depends_on:
    - prowlarr

radarr:
  image: lscr.io/linuxserver/radarr:latest
  container_name: radarr
  environment:
    - PUID=1000
    - PGID=1000
    - TZ=${TZ:-America/New_York}
  volumes:
    - radarr-config:/config
    - ${MEDIA_PATH:-./media}:/media
  ports:
    - "7878:7878"
  restart: unless-stopped
  depends_on:
    - prowlarr
```

Add shared config volumes for auto-discovery (read-only access from Plank):

```yaml
# Under the plank service volumes, add:
- sonarr-config:/sonarr-config:ro
- radarr-config:/radarr-config:ro

# Under the plank service environment, add:
- SONARR_URL=http://sonarr:8989
- SONARR_API_KEY=${SONARR_API_KEY:-}
- SONARR_CONFIG_PATH=/sonarr-config/config.xml
- RADARR_URL=http://radarr:7878
- RADARR_API_KEY=${RADARR_API_KEY:-}
- RADARR_CONFIG_PATH=/radarr-config/config.xml
```

Add new named volumes:

```yaml
volumes:
  plank-db:
  plank-data:
  prowlarr-config:
  sonarr-config:    # NEW
  radarr-config:    # NEW
```

### 1.2 Update `src/lib/config.ts`

Add Sonarr/Radarr config alongside existing Prowlarr config:

```typescript
sonarr: {
  url: env.SONARR_URL || 'http://sonarr:8989',
  apiKey: env.SONARR_API_KEY || '',
  configPath: env.SONARR_CONFIG_PATH || '/sonarr-config/config.xml',
},
radarr: {
  url: env.RADARR_URL || 'http://radarr:7878',
  apiKey: env.RADARR_API_KEY || '',
  configPath: env.RADARR_CONFIG_PATH || '/radarr-config/config.xml',
},
```

### 1.3 Update `.env.example`

```
# Sonarr (optional - enables TV show automation)
SONARR_URL=http://sonarr:8989
SONARR_API_KEY=

# Radarr (optional - enables movie automation)
RADARR_URL=http://radarr:7878
RADARR_API_KEY=
```

---

## Phase 2: Database Schema Changes

### 2.1 New Migration: `drizzle/0007_sonarr_radarr_integration.sql`

Generate via `drizzle-kit generate` after updating `schema.ts`.

### 2.2 Schema Changes in `src/lib/server/db/schema.ts`

#### Modify `configuration` table — add automation fields:

```typescript
// Add to the existing configuration table definition:
sonarrUrl: text('sonarr_url'),
sonarrApiKey: text('sonarr_api_key'),
radarrUrl: text('radarr_url'),
radarrApiKey: text('radarr_api_key'),
automationEnabled: integer('automation_enabled', { mode: 'boolean' }).default(false),
defaultQualityPreset: text('default_quality_preset').default('high_quality'),
// JSON maps: { "standard": 1, "high_quality": 4, "maximum": 6 }
sonarrQualityProfileMap: text('sonarr_quality_profile_map'),
radarrQualityProfileMap: text('radarr_quality_profile_map'),
```

#### Modify `media` table — add Sonarr/Radarr tracking:

```typescript
// Add to the existing media table definition:
sonarrId: integer('sonarr_id'),      // Sonarr's internal series ID
radarrId: integer('radarr_id'),      // Radarr's internal movie ID
currentQuality: text('current_quality'), // "720p", "1080p", "2160p" — parsed from torrent name
```

#### New table: `quality_history`

Tracks quality upgrades with the previous magnet link stored for rollback.

```typescript
export const qualityHistory = sqliteTable(
  'quality_history',
  {
    id: text('id').primaryKey(),
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    previousQuality: text('previous_quality'),
    previousMagnetLink: text('previous_magnet_link').notNull(),
    previousInfohash: text('previous_infohash').notNull(),
    newQuality: text('new_quality'),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index('idx_quality_history_media').on(table.mediaId),
    index('idx_quality_history_expires').on(table.expiresAt),
  ]
);
```

#### New table: `notification`

In-app notifications with a provider pattern for future extensibility.

```typescript
export const notification = sqliteTable(
  'notification',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').references(() => organization.id, {
      onDelete: 'set null',
    }),
    type: text('type', {
      enum: [
        'episode_downloaded',
        'quality_upgraded',
        'movie_available',
        'download_complete',
        'download_error',
      ],
    }).notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    mediaId: text('media_id').references(() => media.id, { onDelete: 'cascade' }),
    read: integer('read', { mode: 'boolean' }).default(false).notNull(),
    metadata: text('metadata'), // JSON for extra context
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index('idx_notification_user').on(table.userId),
    index('idx_notification_read').on(table.userId, table.read),
    index('idx_notification_media').on(table.mediaId),
  ]
);
```

#### New table: `qbit_category`

Stores categories that Sonarr/Radarr create via the qBit compat API.

```typescript
export const qbitCategory = sqliteTable('qbit_category', {
  name: text('name').primaryKey(),
  savePath: text('save_path'),
});
```

#### Add relations for new tables:

```typescript
export const qualityHistoryRelations = relations(qualityHistory, ({ one }) => ({
  media: one(media, {
    fields: [qualityHistory.mediaId],
    references: [media.id],
  }),
}));

export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(user, {
    fields: [notification.userId],
    references: [user.id],
  }),
  organization: one(organization, {
    fields: [notification.organizationId],
    references: [organization.id],
  }),
  media: one(media, {
    fields: [notification.mediaId],
    references: [media.id],
  }),
}));
```

#### Add type exports:

```typescript
export type QualityHistory = typeof qualityHistory.$inferSelect;
export type NewQualityHistory = typeof qualityHistory.$inferInsert;
export type Notification = typeof notification.$inferSelect;
export type NewNotification = typeof notification.$inferInsert;
export type QbitCategory = typeof qbitCategory.$inferSelect;
```

### 2.3 Update `src/lib/server/db.ts` (Repository Layer)

Add repository objects for the new tables following the existing pattern:

```typescript
export const qualityHistoryDb = {
  list: (mediaId: string) => { /* ... */ },
  getActive: (mediaId: string) => {
    // Return unexpired entries: expiresAt > Date.now()
  },
  create: (data: NewQualityHistory) => { /* ... */ },
  delete: (id: string) => { /* ... */ },
  deleteExpired: () => {
    // DELETE FROM quality_history WHERE expires_at < now
  },
};

export const notificationDb = {
  list: (userId: string, options?: { unreadOnly?: boolean; limit?: number; offset?: number }) => { /* ... */ },
  create: (data: NewNotification) => { /* ... */ },
  markRead: (id: string) => { /* ... */ },
  markAllRead: (userId: string) => { /* ... */ },
  unreadCount: (userId: string) => { /* ... */ },
};

export const qbitCategoryDb = {
  list: () => { /* ... */ },
  get: (name: string) => { /* ... */ },
  create: (name: string, savePath?: string) => { /* ... */ },
};
```

---

## Phase 3: qBittorrent-Compatible API Layer

This is the centerpiece of the integration. Plank exposes endpoints that mimic qBittorrent's WebUI API v2. Sonarr/Radarr are configured to use Plank as their "qBittorrent" download client.

Based on Sonarr/Radarr's actual source code (`QBittorrentProxyV2.cs`), these are the exact endpoints they call.

### 3.1 Shared State & Translation Module

**File:** `src/lib/server/qbit-compat.ts`

This module translates between WebTorrent's internal state and qBittorrent's API format.

```typescript
import { getActiveDownloads } from './torrent';
import { mediaDb, downloadsDb, qbitCategoryDb } from './db';

// qBittorrent torrent states that Sonarr/Radarr understand
type QBitState =
  | 'downloading'
  | 'stalledDL'
  | 'uploading'
  | 'pausedUP'
  | 'queuedDL'
  | 'error'
  | 'missingFiles'
  | 'checkingDL';

interface QBitTorrentInfo {
  hash: string;
  name: string;
  size: number;
  progress: number;        // 0.0 to 1.0
  dlspeed: number;         // bytes/sec
  upspeed: number;         // bytes/sec
  num_seeds: number;
  num_leechs: number;
  state: QBitState;
  category: string;        // 'tv-sonarr' or 'radarr'
  save_path: string;
  content_path: string;
  added_on: number;        // unix timestamp seconds
  completion_on: number;   // unix timestamp seconds, -1 if incomplete
  ratio: number;
  eta: number;             // seconds remaining, 8640000 = infinity
  tags: string;
}

// Map Plank's download status to qBit state
function mapState(status: string, hasActiveDownload: boolean): QBitState {
  switch (status) {
    case 'added': return 'stalledDL';
    case 'downloading': return hasActiveDownload ? 'downloading' : 'stalledDL';
    case 'complete': return 'pausedUP';
    case 'error': return 'error';
    default: return 'stalledDL';
  }
}

// Build the torrent info response that Sonarr/Radarr expect
export function buildTorrentInfoList(categoryFilter?: string): QBitTorrentInfo[] {
  // 1. Gather all active downloads from WebTorrent in-memory map
  // 2. Gather all media records from DB
  // 3. Merge them into QBitTorrentInfo objects
  // 4. Filter by category if provided
  // 5. Return the list
}

export function buildTorrentInfo(infohash: string): QBitTorrentInfo | null {
  // Single torrent lookup by hash
}

export function buildTorrentProperties(infohash: string): Record<string, unknown> | null {
  // Detailed properties for a single torrent
}

export function buildTorrentFiles(infohash: string): Array<Record<string, unknown>> {
  // File list within a torrent
}
```

**State mapping reference:**

| Plank Status | Active in WebTorrent? | qBit State | Sonarr/Radarr Interpretation |
|---|---|---|---|
| `added` | No | `stalledDL` | Queued, waiting |
| `added` | Yes, no peers | `stalledDL` | Downloading but stalled |
| `downloading` | Yes, has peers | `downloading` | Actively downloading |
| `complete` | No | `pausedUP` | Completed, seeding paused |
| `error` | No | `error` | Failed |

### 3.2 qBit API Route Handlers

All routes live under `src/routes/api/v2/`. Each file exports the appropriate HTTP method handler.

**Important:** These routes must NOT require Plank's session-based auth. They use qBit's cookie-based auth (SID cookie). During auto-setup, Plank generates a token that Sonarr/Radarr use as the qBit password. Store this token in the `configuration` table as `qbitCompatToken`.

Add to `src/hooks.server.ts`: skip Plank auth for `/api/v2/*` routes, but validate the SID cookie instead.

#### `src/routes/api/v2/auth/login/+server.ts`

```typescript
import type { RequestHandler } from './$types';
import { getSettings } from '$lib/server/settings';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const formData = await request.formData();
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  const settings = await getSettings();

  // Validate against stored qBit compat token
  if (password !== settings.qbitCompatToken) {
    return new Response('Fails.', { status: 200 });
  }

  // Set SID cookie (Sonarr/Radarr will send this on subsequent requests)
  const sid = crypto.randomUUID();
  // Store sid in memory or a lightweight map with expiry
  cookies.set('SID', sid, { path: '/', httpOnly: true, maxAge: 3600 });

  return new Response('Ok.', { status: 200 });
};
```

#### `src/routes/api/v2/app/webapiVersion/+server.ts`

```typescript
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return new Response('2.8.3', { status: 200 });
};
```

#### `src/routes/api/v2/app/version/+server.ts`

```typescript
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return new Response('v4.6.0', { status: 200 });
};
```

#### `src/routes/api/v2/app/preferences/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { config } from '$lib/config';

export const GET: RequestHandler = async () => {
  return json({
    save_path: config.paths.library + '/',
    temp_path: config.paths.temp + '/',
    temp_path_enabled: true,
    max_active_downloads: 5,
    max_active_torrents: 10,
    max_active_uploads: 5,
    queueing_enabled: false,
    // Sonarr/Radarr check these to know if categories work
    create_subfolder_enabled: false,
    start_paused_enabled: false,
    auto_tmm_enabled: false,
  });
};
```

#### `src/routes/api/v2/torrents/add/+server.ts`

**The critical endpoint.** Sonarr/Radarr POST a magnet link here to trigger a download.

```typescript
import { type RequestHandler } from '@sveltejs/kit';
import { startDownload } from '$lib/server/torrent';
import { parseMagnet } from '$lib/server/magnet';
import { mediaDb, downloadsDb, qbitCategoryDb } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
  const formData = await request.formData();
  const urls = formData.get('urls') as string; // magnet link
  const category = formData.get('category') as string; // 'tv-sonarr' or 'radarr'

  if (!urls) {
    return new Response('Fails.', { status: 200 });
  }

  // Parse the magnet link
  const magnetLink = urls.trim();
  const { infohash } = parseMagnet(magnetLink);

  // Store the category -> infohash mapping so we can report it back
  // in torrents/info responses
  // This is handled by the qbit-compat state layer

  // Determine media type from category
  const mediaType = category?.includes('sonarr') ? 'tv' : 'movie';

  // The actual media creation and download start depends on whether
  // this torrent was initiated via Sonarr/Radarr automation or manually.
  //
  // For automated downloads:
  // 1. Create media record (or find existing by tmdbId via Sonarr/Radarr metadata)
  // 2. Create download record
  // 3. Start WebTorrent download
  //
  // The webhook handler (Phase 7) is responsible for linking the Sonarr/Radarr
  // metadata (series ID, episode info, quality) to the Plank media record.
  // At this point we just need to start the download and track the infohash.

  // Store category for this infohash (used by torrents/info)
  storeQbitTorrentCategory(infohash, category);

  // Start the download via existing WebTorrent logic
  // This mirrors what POST /api/media does, but triggered by Sonarr/Radarr
  await handleAutomatedDownload(magnetLink, infohash, mediaType, category);

  return new Response('Ok.', { status: 200 });
};
```

**`handleAutomatedDownload` helper** (in `qbit-compat.ts` or a new `automation-download.ts`):

This function needs to:
1. Check if a media record already exists for this infohash
2. If Sonarr/Radarr sent this, there should be a corresponding entry. The webhook event (which fires slightly before or after the download add) contains the TMDB ID and metadata.
3. Create the media + download records if they don't exist
4. Call `startDownload(mediaId, magnetLink)` from existing `torrent.ts`
5. Parse quality from the torrent name and store in `media.currentQuality`

#### `src/routes/api/v2/torrents/info/+server.ts`

**The polling endpoint.** Sonarr/Radarr call this frequently to check download status.

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { buildTorrentInfoList } from '$lib/server/qbit-compat';

export const GET: RequestHandler = async ({ url }) => {
  const category = url.searchParams.get('category') ?? undefined;
  const torrents = buildTorrentInfoList(category);
  return json(torrents);
};
```

#### `src/routes/api/v2/torrents/properties/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { buildTorrentProperties } from '$lib/server/qbit-compat';

export const GET: RequestHandler = async ({ url }) => {
  const hash = url.searchParams.get('hash');
  if (!hash) return new Response('', { status: 404 });

  const props = buildTorrentProperties(hash);
  if (!props) return new Response('', { status: 404 });

  return json(props);
};
```

#### `src/routes/api/v2/torrents/files/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { buildTorrentFiles } from '$lib/server/qbit-compat';

export const GET: RequestHandler = async ({ url }) => {
  const hash = url.searchParams.get('hash');
  if (!hash) return json([]);

  const files = buildTorrentFiles(hash);
  return json(files);
};
```

#### `src/routes/api/v2/torrents/delete/+server.ts`

```typescript
import type { RequestHandler } from './$types';
import { removeTorrent } from '$lib/server/torrent';

export const POST: RequestHandler = async ({ request }) => {
  const formData = await request.formData();
  const hashes = (formData.get('hashes') as string)?.split('|');
  const deleteFiles = formData.get('deleteFiles') === 'true';

  for (const hash of hashes ?? []) {
    await removeTorrent(hash, deleteFiles);
  }

  return new Response('', { status: 200 });
};
```

#### `src/routes/api/v2/torrents/setCategory/+server.ts`

```typescript
import type { RequestHandler } from './$types';
import { setQbitTorrentCategory } from '$lib/server/qbit-compat';

export const POST: RequestHandler = async ({ request }) => {
  const formData = await request.formData();
  const hashes = (formData.get('hashes') as string)?.split('|') ?? [];
  const category = formData.get('category') as string;

  for (const hash of hashes) {
    setQbitTorrentCategory(hash, category);
  }

  return new Response('', { status: 200 });
};
```

#### `src/routes/api/v2/torrents/createCategory/+server.ts`

```typescript
import type { RequestHandler } from './$types';
import { qbitCategoryDb } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
  const formData = await request.formData();
  const category = formData.get('category') as string;
  const savePath = formData.get('savePath') as string | undefined;

  if (category) {
    qbitCategoryDb.create(category, savePath);
  }

  return new Response('', { status: 200 });
};
```

#### `src/routes/api/v2/torrents/categories/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { qbitCategoryDb } from '$lib/server/db';

export const GET: RequestHandler = async () => {
  const categories = qbitCategoryDb.list();
  // qBit returns categories as an object keyed by name
  const result: Record<string, { name: string; savePath: string }> = {};
  for (const cat of categories) {
    result[cat.name] = { name: cat.name, savePath: cat.savePath ?? '' };
  }
  return json(result);
};
```

#### No-op endpoints (Sonarr/Radarr call these but we don't need real logic):

**`src/routes/api/v2/torrents/setShareLimits/+server.ts`**

```typescript
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
  // No-op: WebTorrent doesn't have configurable share limits
  return new Response('', { status: 200 });
};
```

**`src/routes/api/v2/torrents/topPrio/+server.ts`**

```typescript
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
  // No-op: WebTorrent doesn't have a queue priority system
  return new Response('', { status: 200 });
};
```

**`src/routes/api/v2/torrents/setForceStart/+server.ts`**

```typescript
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
  // No-op: all WebTorrent downloads are already "force started"
  return new Response('', { status: 200 });
};
```

### 3.3 File Management — Keeping Plank in Control

Sonarr/Radarr normally move/rename files after download completion. Plank must prevent this so it stays in control of the `data/library/{uuid}/` folder structure.

**Strategy:** The qBit compat API reports `content_path` pointing to where Plank already moved the completed files. Since Sonarr/Radarr's root folder is set to `data/library/`, and the files are already there, Sonarr/Radarr see them as "already in place" and skip the move step.

During auto-setup (Phase 5), we also disable rename rules in Sonarr/Radarr:

- Sonarr: set `renameEpisodes: false` on the naming config
- Radarr: set `renameMovies: false` on the naming config

In `buildTorrentInfo()`, when a download is complete:

```typescript
{
  // ...
  save_path: `${config.paths.library}/${media.id}/`,
  content_path: `${config.paths.library}/${media.id}/${filename}`,
  // ...
}
```

Sonarr/Radarr see the file is already under their root folder path and skip import/move.

### 3.4 Auth Bypass for qBit Compat Routes

Update `src/hooks.server.ts` to skip Plank's session-based auth for `/api/v2/*` routes:

```typescript
// Add to the isAuthRoute/isApiRoute logic:
const isQbitRoute = event.url.pathname.startsWith('/api/v2');

// Skip Plank auth for qBit compat routes (they use their own SID cookie auth)
if (isApiRoute && !isAuthRoute && !isQbitRoute && !event.locals.user) {
  return new Response('Unauthorized', { status: 401 });
}
```

The qBit routes validate auth via the SID cookie set during `/api/v2/auth/login`. Create a middleware/helper that validates the SID for all `/api/v2/*` routes except `auth/login`.

---

## Phase 4: Sonarr/Radarr API Clients

### 4.1 Sonarr Client

**File:** `src/lib/server/sonarr.ts`

A typed HTTP client wrapping Sonarr's v3 REST API.

```typescript
import { getSettings } from './settings';

interface SonarrConfig {
  url: string;
  apiKey: string;
}

async function getConfig(): Promise<SonarrConfig | null> {
  const settings = await getSettings();
  if (!settings.sonarr?.url || !settings.sonarr?.apiKey) return null;
  return { url: settings.sonarr.url, apiKey: settings.sonarr.apiKey };
}

async function sonarrFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const config = await getConfig();
  if (!config) throw new Error('Sonarr not configured');

  const response = await fetch(`${config.url}/api/v3${path}`, {
    ...options,
    headers: {
      'X-Api-Key': config.apiKey,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Sonarr API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

// ============================================================================
// System
// ============================================================================

export async function getSonarrStatus(): Promise<SonarrSystemStatus> {
  return sonarrFetch('/system/status');
}

export async function testSonarrConnection(): Promise<boolean> {
  try {
    await getSonarrStatus();
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Series (TV Shows)
// ============================================================================

export interface SonarrSeries {
  id: number;
  title: string;
  tvdbId: number;
  tvRageId: number;
  imdbId: string;
  monitored: boolean;
  qualityProfileId: number;
  seasonFolder: boolean;
  path: string;
  year: number;
  overview: string;
  images: Array<{ coverType: string; remoteUrl: string }>;
  seasons: Array<{
    seasonNumber: number;
    monitored: boolean;
    statistics?: { episodeCount: number; episodeFileCount: number };
  }>;
  statistics: { episodeCount: number; episodeFileCount: number; percentOfEpisodes: number };
}

export async function listSeries(): Promise<SonarrSeries[]> {
  return sonarrFetch('/series');
}

export async function getSeries(id: number): Promise<SonarrSeries> {
  return sonarrFetch(`/series/${id}`);
}

export async function addSeries(data: {
  tvdbId: number;
  title: string;
  qualityProfileId: number;
  rootFolderPath: string;
  monitored: boolean;
  seasons: Array<{ seasonNumber: number; monitored: boolean }>;
  addOptions: {
    searchForMissingEpisodes: boolean;
    searchForCutoffUnmetEpisodes: boolean;
    monitor: 'all' | 'future' | 'missing' | 'existing' | 'firstSeason' | 'latestSeason' | 'none';
  };
}): Promise<SonarrSeries> {
  return sonarrFetch('/series', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSeries(id: number, data: Partial<SonarrSeries>): Promise<SonarrSeries> {
  const existing = await getSeries(id);
  return sonarrFetch(`/series/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...existing, ...data }),
  });
}

export async function deleteSeries(id: number, deleteFiles = false): Promise<void> {
  await sonarrFetch(`/series/${id}?deleteFiles=${deleteFiles}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// Episodes
// ============================================================================

export interface SonarrEpisode {
  id: number;
  seriesId: number;
  tvdbId: number;
  episodeNumber: number;
  seasonNumber: number;
  title: string;
  overview: string;
  airDate: string;
  airDateUtc: string;
  monitored: boolean;
  hasFile: boolean;
  episodeFile?: {
    id: number;
    quality: { quality: { id: number; name: string } };
    size: number;
    relativePath: string;
  };
}

export async function listEpisodes(seriesId: number): Promise<SonarrEpisode[]> {
  return sonarrFetch(`/episode?seriesId=${seriesId}`);
}

export async function getEpisode(id: number): Promise<SonarrEpisode> {
  return sonarrFetch(`/episode/${id}`);
}

export async function updateEpisodeMonitoring(
  episodeIds: number[],
  monitored: boolean
): Promise<SonarrEpisode[]> {
  return sonarrFetch('/episode/monitor', {
    method: 'PUT',
    body: JSON.stringify({ episodeIds, monitored }),
  });
}

// ============================================================================
// Calendar
// ============================================================================

export async function getCalendar(
  start?: string,
  end?: string
): Promise<SonarrEpisode[]> {
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  return sonarrFetch(`/calendar?${params}`);
}

// ============================================================================
// Queue
// ============================================================================

export interface SonarrQueueItem {
  id: number;
  seriesId: number;
  episodeId: number;
  title: string;
  status: string;
  trackedDownloadStatus: string;
  size: number;
  sizeleft: number;
  timeleft: string;
  downloadId: string;
  protocol: string;
}

export async function getQueue(): Promise<{ records: SonarrQueueItem[] }> {
  return sonarrFetch('/queue?pageSize=100&includeUnknownSeriesItems=true');
}

// ============================================================================
// History
// ============================================================================

export async function getHistory(
  pageSize = 20,
  page = 1
): Promise<{ records: SonarrHistoryItem[] }> {
  return sonarrFetch(`/history?pageSize=${pageSize}&page=${page}&sortKey=date&sortDirection=descending`);
}

// ============================================================================
// Quality Profiles
// ============================================================================

export interface SonarrQualityProfile {
  id: number;
  name: string;
  cutoff: { id: number; name: string };
  items: Array<{
    quality?: { id: number; name: string };
    allowed: boolean;
  }>;
}

export async function listQualityProfiles(): Promise<SonarrQualityProfile[]> {
  return sonarrFetch('/qualityprofile');
}

// ============================================================================
// Root Folders
// ============================================================================

export async function listRootFolders(): Promise<Array<{ id: number; path: string }>> {
  return sonarrFetch('/rootfolder');
}

export async function addRootFolder(path: string): Promise<{ id: number; path: string }> {
  return sonarrFetch('/rootfolder', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

// ============================================================================
// Download Clients
// ============================================================================

export async function listDownloadClients(): Promise<SonarrDownloadClient[]> {
  return sonarrFetch('/downloadclient');
}

export async function addDownloadClient(data: Record<string, unknown>): Promise<void> {
  await sonarrFetch('/downloadclient', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ============================================================================
// Notifications (Webhooks)
// ============================================================================

export async function listNotifications(): Promise<SonarrNotification[]> {
  return sonarrFetch('/notification');
}

export async function addNotification(data: Record<string, unknown>): Promise<void> {
  await sonarrFetch('/notification', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ============================================================================
// Naming Config
// ============================================================================

export async function getNamingConfig(): Promise<SonarrNamingConfig> {
  return sonarrFetch('/config/naming');
}

export async function updateNamingConfig(data: Partial<SonarrNamingConfig>): Promise<void> {
  const existing = await getNamingConfig();
  await sonarrFetch('/config/naming', {
    method: 'PUT',
    body: JSON.stringify({ ...existing, ...data }),
  });
}

// ============================================================================
// Commands (trigger actions)
// ============================================================================

export async function triggerEpisodeSearch(episodeIds: number[]): Promise<void> {
  await sonarrFetch('/command', {
    method: 'POST',
    body: JSON.stringify({ name: 'EpisodeSearch', episodeIds }),
  });
}

export async function triggerSeriesSearch(seriesId: number): Promise<void> {
  await sonarrFetch('/command', {
    method: 'POST',
    body: JSON.stringify({ name: 'SeriesSearch', seriesId }),
  });
}
```

### 4.2 Radarr Client

**File:** `src/lib/server/radarr.ts`

Same pattern as Sonarr but for Radarr's movie-specific endpoints. The API shape is nearly identical.

```typescript
import { getSettings } from './settings';

// Same fetch helper pattern as sonarr.ts, using radarr config
async function radarrFetch<T>(path: string, options?: RequestInit): Promise<T> { /* ... */ }

// ============================================================================
// System
// ============================================================================
export async function testRadarrConnection(): Promise<boolean> { /* ... */ }

// ============================================================================
// Movies
// ============================================================================

export interface RadarrMovie {
  id: number;
  title: string;
  year: number;
  tmdbId: number;
  imdbId: string;
  monitored: boolean;
  qualityProfileId: number;
  path: string;
  overview: string;
  images: Array<{ coverType: string; remoteUrl: string }>;
  hasFile: boolean;
  movieFile?: {
    id: number;
    quality: { quality: { id: number; name: string } };
    size: number;
    relativePath: string;
  };
  added: string;
  isAvailable: boolean;
}

export async function listMovies(): Promise<RadarrMovie[]> {
  return radarrFetch('/movie');
}

export async function getMovie(id: number): Promise<RadarrMovie> {
  return radarrFetch(`/movie/${id}`);
}

export async function addMovie(data: {
  tmdbId: number;
  title: string;
  qualityProfileId: number;
  rootFolderPath: string;
  monitored: boolean;
  addOptions: {
    searchForMovie: boolean;
    monitor: 'movieOnly' | 'movieAndCollection' | 'none';
  };
}): Promise<RadarrMovie> {
  return radarrFetch('/movie', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateMovie(id: number, data: Partial<RadarrMovie>): Promise<RadarrMovie> {
  const existing = await getMovie(id);
  return radarrFetch(`/movie/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...existing, ...data }),
  });
}

export async function deleteMovie(id: number, deleteFiles = false): Promise<void> {
  await radarrFetch(`/movie/${id}?deleteFiles=${deleteFiles}`, {
    method: 'DELETE',
  });
}

// Quality Profiles, Root Folders, Download Clients, Notifications, Naming Config
// — same pattern as Sonarr, use /api/v3/ prefix

export async function listQualityProfiles(): Promise<RadarrQualityProfile[]> {
  return radarrFetch('/qualityprofile');
}

export async function triggerMovieSearch(movieIds: number[]): Promise<void> {
  await radarrFetch('/command', {
    method: 'POST',
    body: JSON.stringify({ name: 'MoviesSearch', movieIds }),
  });
}
```

### 4.3 Auto-Discovery Module

**File:** `src/lib/server/automation.ts`

Handles auto-discovery of Sonarr/Radarr from Docker config volumes (same pattern as existing Prowlarr discovery) and the auto-setup orchestration.

```typescript
import { readFile } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { config } from '$lib/config';
import { updateSettings } from './settings';
import * as sonarr from './sonarr';
import * as radarr from './radarr';

// ============================================================================
// Auto-Discovery
// ============================================================================

export async function discoverSonarrApiKey(): Promise<string | null> {
  try {
    const configXml = await readFile(config.sonarr.configPath, 'utf-8');
    const parser = new XMLParser();
    const parsed = parser.parse(configXml);
    return parsed?.Config?.ApiKey ?? null;
  } catch {
    return null;
  }
}

export async function discoverRadarrApiKey(): Promise<string | null> {
  try {
    const configXml = await readFile(config.radarr.configPath, 'utf-8');
    const parser = new XMLParser();
    const parsed = parser.parse(configXml);
    return parsed?.Config?.ApiKey ?? null;
  } catch {
    return null;
  }
}

// ============================================================================
// Auto-Setup Orchestration
// ============================================================================

export interface SetupResult {
  sonarr: { connected: boolean; configured: boolean; error?: string };
  radarr: { connected: boolean; configured: boolean; error?: string };
  prowlarrSync: { sonarr: boolean; radarr: boolean };
}

export async function runAutoSetup(): Promise<SetupResult> {
  const result: SetupResult = {
    sonarr: { connected: false, configured: false },
    radarr: { connected: false, configured: false },
    prowlarrSync: { sonarr: false, radarr: false },
  };

  // Step 1: Discover API keys if not already set
  // Step 2: Test connections
  // Step 3: Configure download clients (Plank as qBit)
  // Step 4: Configure root folders
  // Step 5: Disable rename rules
  // Step 6: Configure webhooks for notifications
  // Step 7: Connect Prowlarr to Sonarr/Radarr as applications
  // Step 8: Map quality profiles to Plank presets

  return result;
}
```

Detailed implementation of each step is in the following sections.

---

## Phase 5: Auto-Setup Flow

When the user clicks "Auto-Setup" in the settings page (or on first detection during server startup), `runAutoSetup()` executes these steps sequentially.

### 5.1 Discover & Store API Keys

```typescript
// In runAutoSetup():

// Try to discover API keys from shared config volumes
const sonarrKey = await discoverSonarrApiKey();
const radarrKey = await discoverRadarrApiKey();

if (sonarrKey) {
  await updateSettings({ sonarrUrl: config.sonarr.url, sonarrApiKey: sonarrKey });
}
if (radarrKey) {
  await updateSettings({ radarrUrl: config.radarr.url, radarrApiKey: radarrKey });
}
```

### 5.2 Test Connections

```typescript
if (sonarrKey) {
  result.sonarr.connected = await sonarr.testSonarrConnection();
}
if (radarrKey) {
  result.radarr.connected = await radarr.testRadarrConnection();
}
```

### 5.3 Configure Plank as Download Client

Register Plank's qBit compat API as the download client in Sonarr/Radarr.

Generate a token for qBit compat auth and store it:

```typescript
// Generate and store qBit compat token
const qbitToken = crypto.randomUUID();
await updateSettings({ qbitCompatToken: qbitToken });

// Configure Sonarr's download client
if (result.sonarr.connected) {
  const existingClients = await sonarr.listDownloadClients();
  const plankClient = existingClients.find(c => c.name === 'Plank');

  if (!plankClient) {
    await sonarr.addDownloadClient({
      enable: true,
      name: 'Plank',
      implementation: 'QBittorrent',
      configContract: 'QBittorrentSettings',
      protocol: 'torrent',
      priority: 1,
      removeCompletedDownloads: false,   // Plank manages files
      removeFailedDownloads: true,
      fields: [
        { name: 'host', value: 'plank' },       // Docker service name
        { name: 'port', value: 3000 },
        { name: 'urlBase', value: '' },
        { name: 'username', value: 'plank' },
        { name: 'password', value: qbitToken },
        { name: 'tvCategory', value: 'tv-sonarr' },
        { name: 'recentTvPriority', value: 0 },
        { name: 'olderTvPriority', value: 0 },
        { name: 'initialState', value: 0 },      // Start immediately
        { name: 'sequentialOrder', value: false },
        { name: 'firstAndLast', value: false },
      ],
    });
  }
}

// Same for Radarr with movieCategory: 'radarr'
if (result.radarr.connected) {
  // ... same pattern, using radarr.addDownloadClient()
  // with movieCategory: 'radarr' instead of tvCategory
}
```

### 5.4 Configure Root Folders

```typescript
if (result.sonarr.connected) {
  const rootFolders = await sonarr.listRootFolders();
  const libraryPath = '/media'; // Mapped via Docker volume to same as Plank's library
  if (!rootFolders.some(rf => rf.path === libraryPath)) {
    await sonarr.addRootFolder(libraryPath);
  }
}

// Same for Radarr
```

### 5.5 Disable Rename Rules

Prevent Sonarr/Radarr from renaming files that Plank manages:

```typescript
if (result.sonarr.connected) {
  await sonarr.updateNamingConfig({
    renameEpisodes: false,
  });
}

if (result.radarr.connected) {
  await radarr.updateNamingConfig({
    renameMovies: false,
  });
}
```

### 5.6 Configure Webhooks

Set up Sonarr/Radarr to notify Plank when events happen:

```typescript
if (result.sonarr.connected) {
  const existingNotifications = await sonarr.listNotifications();
  const plankWebhook = existingNotifications.find(n => n.name === 'Plank');

  if (!plankWebhook) {
    await sonarr.addNotification({
      name: 'Plank',
      implementation: 'Webhook',
      configContract: 'WebhookSettings',
      onGrab: true,
      onDownload: true,         // Fires when download completes
      onUpgrade: true,          // Fires when quality upgrade completes
      onSeriesAdd: true,
      onSeriesDelete: true,
      onEpisodeFileDelete: true,
      onHealthIssue: true,
      includeHealthWarnings: false,
      fields: [
        { name: 'url', value: 'http://plank:3000/api/automation/webhook' },
        { name: 'method', value: 1 }, // POST
      ],
    });
  }
}

// Same for Radarr with movie-specific webhook events:
// onGrab, onDownload, onUpgrade, onMovieAdd, onMovieDelete,
// onMovieFileDelete, onHealthIssue
```

### 5.7 Connect Prowlarr to Sonarr/Radarr

Use Prowlarr's application management API to push indexers to Sonarr/Radarr:

```typescript
import { getSettings } from './settings';

const settings = await getSettings();

if (settings.prowlarr.url && settings.prowlarr.apiKey) {
  const prowlarrUrl = settings.prowlarr.url;
  const prowlarrApiKey = settings.prowlarr.apiKey;

  // Check existing applications in Prowlarr
  const appsResponse = await fetch(`${prowlarrUrl}/api/v1/applications`, {
    headers: { 'X-Api-Key': prowlarrApiKey },
  });
  const existingApps = await appsResponse.json();

  // Add Sonarr to Prowlarr if not already configured
  if (result.sonarr.connected) {
    const hasSonarr = existingApps.some(
      (a: Record<string, unknown>) => a.implementation === 'Sonarr'
    );
    if (!hasSonarr) {
      await fetch(`${prowlarrUrl}/api/v1/applications`, {
        method: 'POST',
        headers: {
          'X-Api-Key': prowlarrApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Sonarr',
          implementation: 'Sonarr',
          configContract: 'SonarrSettings',
          syncLevel: 'addOnly',
          fields: [
            { name: 'prowlarrUrl', value: `http://prowlarr:9696` },
            { name: 'baseUrl', value: config.sonarr.url },
            { name: 'apiKey', value: settings.sonarr.apiKey },
            { name: 'syncCategories', value: [5000, 5010, 5020, 5030, 5040, 5045, 5050] },
          ],
        }),
      });
      result.prowlarrSync.sonarr = true;
    }
  }

  // Add Radarr to Prowlarr
  if (result.radarr.connected) {
    const hasRadarr = existingApps.some(
      (a: Record<string, unknown>) => a.implementation === 'Radarr'
    );
    if (!hasRadarr) {
      await fetch(`${prowlarrUrl}/api/v1/applications`, {
        method: 'POST',
        headers: {
          'X-Api-Key': prowlarrApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Radarr',
          implementation: 'Radarr',
          configContract: 'RadarrSettings',
          syncLevel: 'addOnly',
          fields: [
            { name: 'prowlarrUrl', value: `http://prowlarr:9696` },
            { name: 'baseUrl', value: config.radarr.url },
            { name: 'apiKey', value: settings.radarr.apiKey },
            { name: 'syncCategories', value: [2000, 2010, 2020, 2030, 2040, 2045, 2050] },
          ],
        }),
      });
      result.prowlarrSync.radarr = true;
    }
  }

  // Trigger Prowlarr to sync indexers to the new apps
  await fetch(`${prowlarrUrl}/api/v1/command`, {
    method: 'POST',
    headers: {
      'X-Api-Key': prowlarrApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'SyncIndexers' }),
  });
}
```

### 5.8 Map Quality Profiles

Read Sonarr/Radarr's quality profiles and map them to Plank's 3 presets:

```typescript
// Quality preset definitions
const QUALITY_PRESETS = {
  standard: {
    label: 'Standard',
    description: '720p - 1080p',
    preferredQualities: ['Bluray-1080p', 'WEBDL-1080p', 'WEBRip-1080p', 'HDTV-1080p'],
    minimumQualities: ['Bluray-720p', 'WEBDL-720p', 'WEBRip-720p', 'HDTV-720p'],
  },
  high_quality: {
    label: 'High Quality',
    description: '1080p - 2160p',
    preferredQualities: ['Bluray-2160p', 'WEBDL-2160p', 'WEBRip-2160p', 'Remux-2160p'],
    minimumQualities: ['Bluray-1080p', 'WEBDL-1080p', 'WEBRip-1080p'],
  },
  maximum: {
    label: 'Maximum',
    description: 'Always highest available',
    preferredQualities: ['Remux-2160p', 'Bluray-2160p', 'WEBDL-2160p'],
    minimumQualities: ['Bluray-720p', 'WEBDL-720p'],
  },
} as const;

// Map presets to actual Sonarr/Radarr profile IDs
async function mapQualityProfiles(service: 'sonarr' | 'radarr') {
  const profiles = service === 'sonarr'
    ? await sonarr.listQualityProfiles()
    : await radarr.listQualityProfiles();

  const mapping: Record<string, number> = {};

  for (const [preset, config] of Object.entries(QUALITY_PRESETS)) {
    // Find the best matching profile by checking cutoff and allowed qualities
    const match = profiles.find(p => {
      const cutoffName = p.cutoff?.name ?? '';
      return config.preferredQualities.some(q =>
        cutoffName.toLowerCase().includes(q.toLowerCase())
      );
    });

    // Fall back to first profile if no match
    mapping[preset] = match?.id ?? profiles[0]?.id ?? 1;
  }

  // Store mapping in configuration table
  const field = service === 'sonarr' ? 'sonarrQualityProfileMap' : 'radarrQualityProfileMap';
  await updateSettings({ [field]: JSON.stringify(mapping) });

  return mapping;
}
```

---

## Phase 6: Plank API Routes (Automation Proxy)

These routes proxy Sonarr/Radarr's API into Plank's frontend, translating between Sonarr/Radarr's data models and what the Plank UI needs.

### 6.1 Automation Status

**File:** `src/routes/api/automation/status/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { testSonarrConnection } from '$lib/server/sonarr';
import { testRadarrConnection } from '$lib/server/radarr';
import { getSettings } from '$lib/server/settings';

export const GET: RequestHandler = async () => {
  const settings = await getSettings();

  const sonarrConfigured = Boolean(settings.sonarr?.url && settings.sonarr?.apiKey);
  const radarrConfigured = Boolean(settings.radarr?.url && settings.radarr?.apiKey);

  const [sonarrConnected, radarrConnected] = await Promise.all([
    sonarrConfigured ? testSonarrConnection() : Promise.resolve(false),
    radarrConfigured ? testRadarrConnection() : Promise.resolve(false),
  ]);

  return json({
    automationEnabled: settings.automationEnabled ?? false,
    sonarr: { configured: sonarrConfigured, connected: sonarrConnected },
    radarr: { configured: radarrConfigured, connected: radarrConnected },
    defaultQualityPreset: settings.defaultQualityPreset ?? 'high_quality',
  });
};
```

### 6.2 Auto-Setup Trigger

**File:** `src/routes/api/automation/setup/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { runAutoSetup } from '$lib/server/automation';

export const POST: RequestHandler = async () => {
  const result = await runAutoSetup();
  return json(result);
};
```

### 6.3 Series Management (Sonarr Proxy)

**File:** `src/routes/api/automation/series/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import * as sonarr from '$lib/server/sonarr';
import { getSettings } from '$lib/server/settings';

// GET: List all monitored series
export const GET: RequestHandler = async () => {
  const series = await sonarr.listSeries();
  return json(series);
};

// POST: Add a series to Sonarr
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { tvdbId, title, qualityPreset, monitorOption } = body;

  const settings = await getSettings();
  const profileMap = JSON.parse(settings.sonarrQualityProfileMap ?? '{}');
  const qualityProfileId = profileMap[qualityPreset ?? 'high_quality'] ?? 1;

  const rootFolders = await sonarr.listRootFolders();
  const rootFolderPath = rootFolders[0]?.path ?? '/media';

  const result = await sonarr.addSeries({
    tvdbId,
    title,
    qualityProfileId,
    rootFolderPath,
    monitored: true,
    seasons: [], // Sonarr auto-populates from TVDB
    addOptions: {
      searchForMissingEpisodes: true,
      searchForCutoffUnmetEpisodes: false,
      monitor: monitorOption ?? 'all',
    },
  });

  return json(result, { status: 201 });
};
```

**File:** `src/routes/api/automation/series/[id]/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import * as sonarr from '$lib/server/sonarr';

// GET: Get series details
export const GET: RequestHandler = async ({ params }) => {
  const series = await sonarr.getSeries(Number(params.id));
  return json(series);
};

// PUT: Update series (monitoring, quality profile)
export const PUT: RequestHandler = async ({ params, request }) => {
  const body = await request.json();
  const result = await sonarr.updateSeries(Number(params.id), body);
  return json(result);
};

// DELETE: Remove series from Sonarr
export const DELETE: RequestHandler = async ({ params, url }) => {
  const deleteFiles = url.searchParams.get('deleteFiles') === 'true';
  await sonarr.deleteSeries(Number(params.id), deleteFiles);
  return new Response(null, { status: 204 });
};
```

**File:** `src/routes/api/automation/series/[id]/episodes/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import * as sonarr from '$lib/server/sonarr';

// GET: List episodes with monitoring state
export const GET: RequestHandler = async ({ params }) => {
  const episodes = await sonarr.listEpisodes(Number(params.id));
  return json(episodes);
};

// PUT: Bulk update episode monitoring
export const PUT: RequestHandler = async ({ request }) => {
  const { episodeIds, monitored } = await request.json();
  const result = await sonarr.updateEpisodeMonitoring(episodeIds, monitored);
  return json(result);
};
```

**File:** `src/routes/api/automation/series/[id]/search/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import * as sonarr from '$lib/server/sonarr';

// POST: Trigger search for series or specific episodes
export const POST: RequestHandler = async ({ params, request }) => {
  const body = await request.json();

  if (body.episodeIds?.length) {
    await sonarr.triggerEpisodeSearch(body.episodeIds);
  } else {
    await sonarr.triggerSeriesSearch(Number(params.id));
  }

  return json({ ok: true });
};
```

### 6.4 Movie Management (Radarr Proxy)

**File:** `src/routes/api/automation/movies/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import * as radarr from '$lib/server/radarr';
import { getSettings } from '$lib/server/settings';

// GET: List all monitored/wishlisted movies
export const GET: RequestHandler = async () => {
  const movies = await radarr.listMovies();
  return json(movies);
};

// POST: Add movie to Radarr (also serves as "wishlist" for unreleased movies)
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { tmdbId, title, qualityPreset, searchForMovie } = body;

  const settings = await getSettings();
  const profileMap = JSON.parse(settings.radarrQualityProfileMap ?? '{}');
  const qualityProfileId = profileMap[qualityPreset ?? 'high_quality'] ?? 1;

  const rootFolders = await radarr.listRootFolders();
  const rootFolderPath = rootFolders[0]?.path ?? '/media';

  const result = await radarr.addMovie({
    tmdbId,
    title,
    qualityProfileId,
    rootFolderPath,
    monitored: true,
    addOptions: {
      searchForMovie: searchForMovie ?? true,
      monitor: 'movieOnly',
    },
  });

  return json(result, { status: 201 });
};
```

**File:** `src/routes/api/automation/movies/[id]/+server.ts`

Same pattern as series: GET, PUT, DELETE.

**File:** `src/routes/api/automation/movies/[id]/search/+server.ts`

Trigger manual search via Radarr.

### 6.5 Calendar

**File:** `src/routes/api/automation/calendar/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import * as sonarr from '$lib/server/sonarr';

export const GET: RequestHandler = async ({ url }) => {
  const start = url.searchParams.get('start') ?? undefined;
  const end = url.searchParams.get('end') ?? undefined;
  const calendar = await sonarr.getCalendar(start, end);
  return json(calendar);
};
```

### 6.6 Queue & History

**File:** `src/routes/api/automation/queue/+server.ts`

Merges Sonarr + Radarr queue data.

**File:** `src/routes/api/automation/history/+server.ts`

Merges Sonarr + Radarr history data.

### 6.7 Quality Profiles

**File:** `src/routes/api/automation/profiles/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { getSettings } from '$lib/server/settings';

const PRESETS = [
  { id: 'standard', label: 'Standard', description: '720p - 1080p' },
  { id: 'high_quality', label: 'High Quality', description: '1080p - 2160p' },
  { id: 'maximum', label: 'Maximum', description: 'Always highest available' },
];

export const GET: RequestHandler = async () => {
  const settings = await getSettings();
  return json({
    presets: PRESETS,
    defaultPreset: settings.defaultQualityPreset ?? 'high_quality',
    sonarrMapping: JSON.parse(settings.sonarrQualityProfileMap ?? '{}'),
    radarrMapping: JSON.parse(settings.radarrQualityProfileMap ?? '{}'),
  });
};
```

---

## Phase 7: Webhook Receiver & Notifications

### 7.1 Webhook Receiver

**File:** `src/routes/api/automation/webhook/+server.ts`

Receives webhook events from Sonarr/Radarr and translates them into Plank notifications + library sync operations.

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { notificationDb, mediaDb, qualityHistoryDb } from '$lib/server/db';
import { nanoid } from 'nanoid';

// Sonarr/Radarr webhook event types
type WebhookEventType =
  | 'Grab'             // Sonarr/Radarr grabbed a torrent
  | 'Download'         // Download completed
  | 'Rename'           // File renamed
  | 'EpisodeFileDelete'
  | 'MovieFileDelete'
  | 'SeriesAdd'
  | 'SeriesDelete'
  | 'MovieAdd'
  | 'MovieDelete'
  | 'Health'
  | 'Upgrade';         // Quality upgrade completed (subset of Download)

interface WebhookPayload {
  eventType: WebhookEventType;
  instanceName: string;
  // Series/Episode fields (Sonarr)
  series?: { id: number; title: string; tvdbId: number; imdbId: string };
  episodes?: Array<{
    id: number;
    episodeNumber: number;
    seasonNumber: number;
    title: string;
  }>;
  episodeFile?: {
    id: number;
    quality: string;
    qualityVersion: number;
    relativePath: string;
    size: number;
  };
  // Movie fields (Radarr)
  movie?: { id: number; title: string; year: number; tmdbId: number; imdbId: string };
  movieFile?: {
    id: number;
    quality: string;
    relativePath: string;
    size: number;
  };
  remoteMovie?: { tmdbId: number; imdbId: string; title: string; year: number };
  // Download info
  downloadId?: string;
  isUpgrade?: boolean;
  // Release info (on Grab)
  release?: {
    quality: string;
    size: number;
    title: string;
    indexer: string;
    releaseGroup: string;
  };
}

export const POST: RequestHandler = async ({ request }) => {
  const payload = (await request.json()) as WebhookPayload;

  switch (payload.eventType) {
    case 'Grab':
      await handleGrab(payload);
      break;
    case 'Download':
      await handleDownload(payload);
      break;
    case 'Health':
      await handleHealth(payload);
      break;
    case 'SeriesDelete':
    case 'MovieDelete':
      await handleDelete(payload);
      break;
  }

  return json({ ok: true });
};

async function handleGrab(payload: WebhookPayload) {
  // A torrent was grabbed (download starting)
  // Link the Sonarr/Radarr media ID to Plank's media record
  // Create notification: "Downloading: Movie Title (1080p)"

  const title = payload.movie?.title ?? payload.series?.title ?? 'Unknown';
  const quality = payload.release?.quality ?? 'Unknown';

  // Find the Plank media record by tmdbId or sonarrId/radarrId
  // Update media.sonarrId or media.radarrId if not already linked

  // Notify all org members
  await createNotificationForOrg({
    type: 'download_complete', // reuse for "grabbing"
    title: `Downloading: ${title}`,
    message: `${title} (${quality}) is being downloaded`,
  });
}

async function handleDownload(payload: WebhookPayload) {
  const isUpgrade = payload.isUpgrade ?? false;

  if (isUpgrade) {
    // Quality upgrade completed
    // 1. Find the Plank media record
    // 2. Save the PREVIOUS magnet link to quality_history with 48hr expiry
    // 3. Update media.currentQuality to the new quality
    // 4. Create notification

    const title = payload.movie?.title ?? payload.series?.title ?? 'Unknown';
    const newQuality = payload.movieFile?.quality ?? payload.episodeFile?.quality ?? 'Unknown';

    // Find media record by sonarrId/radarrId
    const tmdbId = payload.movie?.tmdbId ?? undefined;
    const media = tmdbId ? mediaDb.getByTmdbId(tmdbId) : null;

    if (media) {
      // Save rollback info
      qualityHistoryDb.create({
        id: nanoid(),
        mediaId: media.id,
        previousQuality: media.currentQuality,
        previousMagnetLink: media.magnetLink,
        previousInfohash: media.infohash,
        newQuality: String(newQuality),
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
      });

      // Update current quality
      mediaDb.update(media.id, { currentQuality: String(newQuality) });
    }

    await createNotificationForOrg({
      type: 'quality_upgraded',
      title: `Quality Upgraded: ${title}`,
      message: `${title} upgraded to ${newQuality}. Rollback available for 48 hours.`,
      mediaId: media?.id,
    });
  } else {
    // Normal download completed
    const title = payload.movie?.title ?? payload.series?.title ?? 'Unknown';

    if (payload.episodes?.length) {
      // TV episode downloaded
      const ep = payload.episodes[0];
      await createNotificationForOrg({
        type: 'episode_downloaded',
        title: `New Episode: ${title}`,
        message: `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} - ${ep.title}`,
      });
    } else if (payload.movie) {
      await createNotificationForOrg({
        type: 'movie_available',
        title: `Movie Available: ${title}`,
        message: `${title} (${payload.movie.year}) has finished downloading`,
      });
    }
  }
}

async function handleHealth(payload: WebhookPayload) {
  // Sonarr/Radarr health issue - log it, maybe notify admins
}

async function handleDelete(payload: WebhookPayload) {
  // Media was removed from Sonarr/Radarr
  // Optionally sync: remove from Plank's library too, or just clear the sonarrId/radarrId
}

// Helper: create notification for all members of the org
async function createNotificationForOrg(data: {
  type: string;
  title: string;
  message: string;
  mediaId?: string;
}) {
  // Get all members of the active organization
  // Create a notification record for each member
  // (In practice, get the org from the media record or from config)
}
```

### 7.2 Notification API

**File:** `src/routes/api/notifications/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { notificationDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const offset = Number(url.searchParams.get('offset') ?? 0);

  const notifications = notificationDb.list(locals.user.id, { unreadOnly, limit, offset });
  const unreadCount = notificationDb.unreadCount(locals.user.id);

  return json({ notifications, unreadCount });
};
```

**File:** `src/routes/api/notifications/[id]/read/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { notificationDb } from '$lib/server/db';

export const PUT: RequestHandler = async ({ params }) => {
  notificationDb.markRead(params.id);
  return json({ ok: true });
};
```

**File:** `src/routes/api/notifications/read-all/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { notificationDb } from '$lib/server/db';

export const PUT: RequestHandler = async ({ locals }) => {
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  notificationDb.markAllRead(locals.user.id);
  return json({ ok: true });
};
```

**File:** `src/routes/api/notifications/stream/+server.ts`

SSE endpoint for real-time notification delivery (future enhancement):

```typescript
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const stream = new ReadableStream({
    start(controller) {
      // Subscribe to notification events for this user
      // On new notification: controller.enqueue(`data: ${JSON.stringify(notification)}\n\n`)
      // On close: cleanup subscription
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
```

### 7.3 Quality Rollback

**File:** `src/routes/api/media/[id]/quality-history/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { qualityHistoryDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ params }) => {
  const history = qualityHistoryDb.list(params.id);
  return json(history);
};
```

**File:** `src/routes/api/media/[id]/rollback/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { qualityHistoryDb, mediaDb } from '$lib/server/db';
import { startDownload } from '$lib/server/torrent';

export const POST: RequestHandler = async ({ params }) => {
  const mediaId = params.id;

  // Get the active (unexpired) quality history entry
  const activeHistory = qualityHistoryDb.getActive(mediaId);
  if (!activeHistory) {
    return json({ error: 'No rollback available' }, { status: 404 });
  }

  // Re-download the old version using the stored magnet link
  // This will replace the current file via the normal download flow
  await startDownload(mediaId, activeHistory.previousMagnetLink);

  // Update the quality back
  mediaDb.update(mediaId, {
    currentQuality: activeHistory.previousQuality,
  });

  // Remove the history entry (rollback consumed)
  qualityHistoryDb.delete(activeHistory.id);

  return json({ ok: true, message: 'Rollback initiated' });
};
```

### 7.4 Rollback Cleanup Cron

**Update:** `src/lib/server/scheduler.ts`

Add a new cron job for cleaning up expired quality history records:

```typescript
export function qualityHistoryCleanupScheduler() {
  // Run every hour
  cron.schedule('0 * * * *', () => {
    console.log('[Scheduler] Cleaning expired quality history records...');
    try {
      qualityHistoryDb.deleteExpired();
      console.log('[Scheduler] Quality history cleanup completed.');
    } catch (e) {
      console.error('[Scheduler] Quality history cleanup failed:', e);
    }
  });
}
```

Register in `src/hooks.server.ts`:

```typescript
import { qualityHistoryCleanupScheduler } from '$lib/server/scheduler';
qualityHistoryCleanupScheduler();
```

---

## Phase 8: Settings UI Redesign

### 8.1 Route Structure

Restructure the account page into a settings hub with sub-pages:

```
src/routes/(app)/settings/
  +layout.svelte            -- Sidebar nav (desktop) / hamburger drawer (mobile)
  +layout.server.ts         -- Load settings data
  +page.svelte              -- Redirect to /settings/account
  account/+page.svelte      -- User info, password, organization members
  automation/+page.svelte   -- Sonarr/Radarr connection, quality defaults, monitoring
  connections/+page.svelte  -- Prowlarr setup, TMDB key
  notifications/+page.svelte -- Notification preferences (future placeholder)
```

### 8.2 Settings Layout

**File:** `src/routes/(app)/settings/+layout.svelte`

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { Menu, X, User, Zap, Link2, Bell } from '@lucide/svelte';
  import Button from '$lib/components/ui/Button.svelte';

  let mobileNavOpen = $state(false);

  const navItems = [
    { href: '/settings/account', label: 'Account', icon: User },
    { href: '/settings/automation', label: 'Automation', icon: Zap },
    { href: '/settings/connections', label: 'Connections', icon: Link2 },
    { href: '/settings/notifications', label: 'Notifications', icon: Bell },
  ];

  const currentPath = $derived($page.url.pathname);
</script>

<div class="container mx-auto px-4 py-8 max-w-6xl">
  <!-- Mobile Header -->
  <div class="md:hidden flex items-center justify-between mb-4">
    <h1 class="text-2xl font-bold">Settings</h1>
    <Button variant="ghost" size="icon" onclick={() => (mobileNavOpen = !mobileNavOpen)}>
      {#if mobileNavOpen}
        <X class="w-5 h-5" />
      {:else}
        <Menu class="w-5 h-5" />
      {/if}
    </Button>
  </div>

  <!-- Mobile Nav Drawer -->
  {#if mobileNavOpen}
    <nav class="md:hidden mb-6 rounded-xl border border-border bg-card p-2 space-y-1">
      {#each navItems as item}
        <a
          href={item.href}
          class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
            {currentPath === item.href
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:bg-accent'}"
          onclick={() => (mobileNavOpen = false)}
        >
          <item.icon class="w-4 h-4" />
          {item.label}
        </a>
      {/each}
    </nav>
  {/if}

  <div class="flex gap-8">
    <!-- Desktop Sidebar -->
    <nav class="hidden md:block w-56 shrink-0">
      <h1 class="text-2xl font-bold mb-6">Settings</h1>
      <div class="space-y-1">
        {#each navItems as item}
          <a
            href={item.href}
            class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
              {currentPath === item.href
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent'}"
          >
            <item.icon class="w-4 h-4" />
            {item.label}
          </a>
        {/each}
      </div>
    </nav>

    <!-- Content Area -->
    <div class="flex-1 min-w-0">
      <slot />
    </div>
  </div>
</div>
```

### 8.3 Account Page

**File:** `src/routes/(app)/settings/account/+page.svelte`

Move the existing content from `src/routes/(app)/account/+page.svelte` here. Remove the `<h1>Account</h1>` header and back button (handled by layout now).

### 8.4 Automation Settings Page

**File:** `src/routes/(app)/settings/automation/+page.svelte`

```svelte
<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { toast } from 'svelte-sonner';
  import { CircleCheck, CircleX, Loader2, RefreshCw, Zap } from '@lucide/svelte';
  import Button from '$lib/components/ui/Button.svelte';

  const queryClient = useQueryClient();

  // Fetch automation status
  const statusQuery = createQuery({
    queryKey: ['automation', 'status'],
    queryFn: async () => {
      const res = await fetch('/api/automation/status');
      return res.json();
    },
  });

  // Auto-setup mutation
  const setupMutation = createMutation({
    mutationFn: async () => {
      const res = await fetch('/api/automation/setup', { method: 'POST' });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['automation'] });
      if (data.sonarr.configured && data.radarr.configured) {
        toast.success('Automation configured successfully');
      } else {
        toast.info('Partial configuration — check connection status');
      }
    },
    onError: () => {
      toast.error('Auto-setup failed');
    },
  });
</script>

<div class="space-y-6">
  <div>
    <h2 class="text-xl font-semibold">Automation</h2>
    <p class="text-sm text-muted-foreground mt-1">
      Connect Sonarr and Radarr to enable automatic episode monitoring,
      quality upgrades, and wishlisting.
    </p>
  </div>

  <!-- Connection Status Cards -->
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <!-- Sonarr Card -->
    <div class="rounded-xl border border-border bg-card p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-medium">Sonarr</h3>
        {#if $statusQuery.data?.sonarr.connected}
          <CircleCheck class="w-5 h-5 text-green-500" />
        {:else}
          <CircleX class="w-5 h-5 text-red-500" />
        {/if}
      </div>
      <p class="text-sm text-muted-foreground">
        {$statusQuery.data?.sonarr.connected
          ? 'Connected — TV show automation active'
          : 'Not connected'}
      </p>
    </div>

    <!-- Radarr Card -->
    <div class="rounded-xl border border-border bg-card p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-medium">Radarr</h3>
        {#if $statusQuery.data?.radarr.connected}
          <CircleCheck class="w-5 h-5 text-green-500" />
        {:else}
          <CircleX class="w-5 h-5 text-red-500" />
        {/if}
      </div>
      <p class="text-sm text-muted-foreground">
        {$statusQuery.data?.radarr.connected
          ? 'Connected — movie automation active'
          : 'Not connected'}
      </p>
    </div>
  </div>

  <!-- Auto-Setup Button -->
  <Button
    onclick={() => $setupMutation.mutate()}
    disabled={$setupMutation.isPending}
  >
    {#if $setupMutation.isPending}
      <Loader2 class="w-4 h-4 mr-2 animate-spin" />
      Configuring...
    {:else}
      <RefreshCw class="w-4 h-4 mr-2" />
      Auto-Setup
    {/if}
  </Button>

  <!-- Quality Preset Default -->
  <!-- ... dropdown for Standard / High Quality / Maximum ... -->

  <!-- Advanced: Link to Sonarr/Radarr UIs -->
  <!-- ... external links for advanced configuration ... -->
</div>
```

### 8.5 Update Navigation

Update `src/lib/components/Layout.svelte` to change the account link from `/account` to `/settings/account`. Add a redirect from `/account` to `/settings/account` for backwards compatibility.

---

## Phase 9: Deep UI Integration

### 9.1 Browse Page Changes

**When Sonarr/Radarr are connected,** the browse page actions change:

**Adding a TV show (Sonarr connected):**
1. User clicks "Add to Library" on a TV show card
2. Show a sheet/dialog:
   - Quality preset picker (Standard / High Quality / Maximum)
   - Monitor option: "All Episodes", "Future Episodes Only", "First Season", "Latest Season"
   - "Add to Sonarr" button
3. On confirm: `POST /api/automation/series` with tvdbId, qualityPreset, monitorOption
4. Sonarr searches Prowlarr, sends torrent to Plank's qBit compat API
5. Show toast: "Added to Sonarr — searching for episodes"

**Adding a movie when Prowlarr finds no torrent (Radarr connected):**
1. User tries to add a movie, Prowlarr search returns nothing
2. Instead of "No torrents found" error, show: "Add to Wishlist"
3. On click: `POST /api/automation/movies` with `searchForMovie: true`
4. Radarr monitors for the movie and auto-downloads when available
5. Show toast: "Added to wishlist — will download automatically when available"

**When NOT connected:** Everything works exactly as it does today (manual Prowlarr search + WebTorrent download).

### 9.2 TV Show Detail Page Changes

Add to the existing media detail page for TV shows:

**When Sonarr is connected and `media.sonarrId` exists:**

- **Monitor toggle** in the header: ON/OFF for the entire series
  - Calls `PUT /api/automation/series/{sonarrId}` with `{ monitored: true/false }`
- **Quality preset badge** showing current preset
- **Per-season monitoring:** Each season section gets a toggle
  - Calls `PUT /api/automation/series/{sonarrId}` with updated `seasons` array
- **Per-episode monitoring:** Each episode row gets a small toggle icon
  - Calls `PUT /api/automation/series/{sonarrId}/episodes` with `{ episodeIds, monitored }`
- **Episode status from Sonarr:** Show badges like "Missing", "Downloaded", "Monitored"

### 9.3 Movie Detail Page Changes

**When Radarr is connected and `media.radarrId` exists:**

- **Quality badge** showing current quality (e.g., "1080p") from `media.currentQuality`
- **Quality history section** (if `qualityHistory` records exist):
  - Timeline showing upgrades: "720p -> 1080p, 2 hours ago"
  - "Rollback" button if within 48-hour grace period
    - Calls `POST /api/media/{id}/rollback`
    - Shows confirmation dialog: "This will re-download the 720p version and replace the current file."
- **Monitor toggle** for Radarr monitoring

### 9.4 New Components

**`src/lib/components/QualityPresetPicker.svelte`**

```svelte
<script lang="ts">
  const presets = [
    { id: 'standard', label: 'Standard', description: '720p - 1080p' },
    { id: 'high_quality', label: 'High Quality', description: '1080p - 2160p' },
    { id: 'maximum', label: 'Maximum', description: 'Always highest available' },
  ];

  let { value = $bindable('high_quality') } = $props();
</script>

<div class="space-y-2">
  {#each presets as preset}
    <button
      class="w-full flex items-center justify-between p-3 rounded-lg border transition-colors
        {value === preset.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'}"
      onclick={() => (value = preset.id)}
    >
      <div>
        <p class="font-medium text-sm">{preset.label}</p>
        <p class="text-xs text-muted-foreground">{preset.description}</p>
      </div>
    </button>
  {/each}
</div>
```

**`src/lib/components/MonitorToggle.svelte`**

```svelte
<script lang="ts">
  import { Bookmark, BookmarkCheck } from '@lucide/svelte';

  let { monitored = $bindable(false), size = 'default', onchange } = $props<{
    monitored: boolean;
    size?: 'default' | 'sm';
    onchange?: (monitored: boolean) => void;
  }>();
</script>

<button
  class="transition-colors {monitored ? 'text-primary' : 'text-muted-foreground hover:text-primary/60'}"
  title={monitored ? 'Monitored — click to unmonitor' : 'Not monitored — click to monitor'}
  onclick={() => {
    monitored = !monitored;
    onchange?.(monitored);
  }}
>
  {#if monitored}
    <BookmarkCheck class={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} />
  {:else}
    <Bookmark class={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} />
  {/if}
</button>
```

**`src/lib/components/NotificationBell.svelte`**

```svelte
<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { Bell } from '@lucide/svelte';

  const queryClient = useQueryClient();

  const notificationsQuery = createQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await fetch('/api/notifications?limit=10');
      return res.json();
    },
    refetchInterval: 30000, // Poll every 30 seconds
  });

  const markAllReadMutation = createMutation({
    mutationFn: async () => {
      await fetch('/api/notifications/read-all', { method: 'PUT' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  let dropdownOpen = $state(false);
  const unreadCount = $derived($notificationsQuery.data?.unreadCount ?? 0);
</script>

<div class="relative">
  <button
    class="relative p-2 rounded-lg hover:bg-accent transition-colors"
    onclick={() => (dropdownOpen = !dropdownOpen)}
  >
    <Bell class="w-5 h-5" />
    {#if unreadCount > 0}
      <span class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs
        rounded-full flex items-center justify-center font-medium">
        {unreadCount > 9 ? '9+' : unreadCount}
      </span>
    {/if}
  </button>

  {#if dropdownOpen}
    <div class="absolute right-0 top-12 w-80 max-h-96 overflow-y-auto
      rounded-xl border border-border bg-card shadow-lg z-50">
      <div class="flex items-center justify-between p-3 border-b border-border">
        <h3 class="font-medium text-sm">Notifications</h3>
        {#if unreadCount > 0}
          <button
            class="text-xs text-primary hover:underline"
            onclick={() => $markAllReadMutation.mutate()}
          >
            Mark all read
          </button>
        {/if}
      </div>

      {#each $notificationsQuery.data?.notifications ?? [] as notification}
        <a
          href={notification.mediaId ? `/watch/${notification.mediaId}` : '#'}
          class="block p-3 border-b border-border hover:bg-accent transition-colors
            {notification.read ? 'opacity-60' : ''}"
        >
          <p class="text-sm font-medium">{notification.title}</p>
          <p class="text-xs text-muted-foreground mt-1">{notification.message}</p>
        </a>
      {/each}

      {#if ($notificationsQuery.data?.notifications ?? []).length === 0}
        <p class="p-6 text-center text-sm text-muted-foreground">No notifications</p>
      {/if}
    </div>
  {/if}
</div>
```

**`src/lib/components/QualityBadge.svelte`**

```svelte
<script lang="ts">
  let { quality } = $props<{ quality: string | null }>();

  const colorMap: Record<string, string> = {
    '2160p': 'bg-purple-500/20 text-purple-400',
    '1080p': 'bg-blue-500/20 text-blue-400',
    '720p': 'bg-green-500/20 text-green-400',
    '480p': 'bg-yellow-500/20 text-yellow-400',
  };

  const colorClass = $derived(
    quality ? (colorMap[quality] ?? 'bg-gray-500/20 text-gray-400') : ''
  );
</script>

{#if quality}
  <span class="text-xs px-2 py-0.5 rounded-full font-medium {colorClass}">
    {quality}
  </span>
{/if}
```

---

## Phase 10: TanStack Query Integration

### 10.1 Query Keys

**Update:** `src/lib/query-keys.ts`

```typescript
// Add to existing queryKeys object:
automation: {
  all: ['automation'] as const,
  status: () => [...queryKeys.automation.all, 'status'] as const,
  calendar: (start?: string, end?: string) =>
    [...queryKeys.automation.all, 'calendar', { start, end }] as const,
  queue: () => [...queryKeys.automation.all, 'queue'] as const,
  history: (page?: number) => [...queryKeys.automation.all, 'history', page] as const,
  series: () => [...queryKeys.automation.all, 'series'] as const,
  seriesDetail: (id: number) => [...queryKeys.automation.all, 'series', id] as const,
  seriesEpisodes: (id: number) => [...queryKeys.automation.all, 'series', id, 'episodes'] as const,
  movies: () => [...queryKeys.automation.all, 'movies'] as const,
  movieDetail: (id: number) => [...queryKeys.automation.all, 'movies', id] as const,
  profiles: () => [...queryKeys.automation.all, 'profiles'] as const,
},
notifications: {
  all: ['notifications'] as const,
  list: (options?: { unreadOnly?: boolean }) =>
    [...queryKeys.notifications.all, 'list', options] as const,
},
qualityHistory: {
  forMedia: (mediaId: string) => ['quality-history', mediaId] as const,
},
```

### 10.2 Query Hooks

**New file:** `src/lib/queries/automation-queries.ts`

```typescript
import { createQuery } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/query-keys';

export function useAutomationStatus() {
  return createQuery({
    queryKey: queryKeys.automation.status(),
    queryFn: () => fetch('/api/automation/status').then(r => r.json()),
    staleTime: 60_000,
  });
}

export function useMonitoredSeries() {
  return createQuery({
    queryKey: queryKeys.automation.series(),
    queryFn: () => fetch('/api/automation/series').then(r => r.json()),
  });
}

export function useSeriesEpisodes(seriesId: number) {
  return createQuery({
    queryKey: queryKeys.automation.seriesEpisodes(seriesId),
    queryFn: () => fetch(`/api/automation/series/${seriesId}/episodes`).then(r => r.json()),
  });
}

export function useUpcomingCalendar() {
  const now = new Date();
  const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  return createQuery({
    queryKey: queryKeys.automation.calendar(now.toISOString(), twoWeeksOut.toISOString()),
    queryFn: () =>
      fetch(`/api/automation/calendar?start=${now.toISOString()}&end=${twoWeeksOut.toISOString()}`)
        .then(r => r.json()),
  });
}

export function useNotifications() {
  return createQuery({
    queryKey: queryKeys.notifications.all,
    queryFn: () => fetch('/api/notifications?limit=20').then(r => r.json()),
    refetchInterval: 30_000,
  });
}

export function useQualityHistory(mediaId: string) {
  return createQuery({
    queryKey: queryKeys.qualityHistory.forMedia(mediaId),
    queryFn: () => fetch(`/api/media/${mediaId}/quality-history`).then(r => r.json()),
  });
}
```

**New file:** `src/lib/mutations/automation-mutations.ts`

```typescript
import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/query-keys';
import { toast } from 'svelte-sonner';

export function useAutoSetup() {
  const queryClient = useQueryClient();
  return createMutation({
    mutationFn: () => fetch('/api/automation/setup', { method: 'POST' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.automation.all });
      toast.success('Automation configured');
    },
    onError: () => toast.error('Auto-setup failed'),
  });
}

export function useAddSeriesToSonarr() {
  const queryClient = useQueryClient();
  return createMutation({
    mutationFn: (data: { tvdbId: number; title: string; qualityPreset: string; monitorOption: string }) =>
      fetch('/api/automation/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.automation.series() });
      toast.success('Series added to Sonarr');
    },
  });
}

export function useAddMovieToRadarr() {
  const queryClient = useQueryClient();
  return createMutation({
    mutationFn: (data: { tmdbId: number; title: string; qualityPreset: string }) =>
      fetch('/api/automation/movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.automation.movies() });
      toast.success('Movie added to Radarr');
    },
  });
}

export function useToggleMonitoring(type: 'series' | 'movie') {
  const queryClient = useQueryClient();
  return createMutation({
    mutationFn: (data: { id: number; monitored: boolean }) =>
      fetch(`/api/automation/${type === 'series' ? 'series' : 'movies'}/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monitored: data.monitored }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.automation.all });
    },
  });
}

export function useUpdateEpisodeMonitoring(seriesId: number) {
  const queryClient = useQueryClient();
  return createMutation({
    mutationFn: (data: { episodeIds: number[]; monitored: boolean }) =>
      fetch(`/api/automation/series/${seriesId}/episodes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.automation.seriesEpisodes(seriesId),
      });
    },
  });
}

export function useQualityRollback(mediaId: string) {
  const queryClient = useQueryClient();
  return createMutation({
    mutationFn: () =>
      fetch(`/api/media/${mediaId}/rollback`, { method: 'POST' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.qualityHistory.forMedia(mediaId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.media.detail(mediaId) });
      toast.success('Rollback initiated — re-downloading previous version');
    },
    onError: () => toast.error('Rollback failed'),
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return createMutation({
    mutationFn: (id: string) =>
      fetch(`/api/notifications/${id}/read`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return createMutation({
    mutationFn: () => fetch('/api/notifications/read-all', { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}
```

---

## Phase 11: Update `src/lib/server/settings.ts`

Add Sonarr/Radarr fields to the settings interface and getter:

```typescript
export interface AppSettings {
  tmdb: { /* existing */ };
  prowlarr: { /* existing */ };
  sonarr: {
    url: string;
    apiKey: string;
  };
  radarr: {
    url: string;
    apiKey: string;
  };
  automation: {
    enabled: boolean;
    defaultQualityPreset: 'standard' | 'high_quality' | 'maximum';
    qbitCompatToken: string;
    sonarrQualityProfileMap: Record<string, number>;
    radarrQualityProfileMap: Record<string, number>;
  };
}
```

Update `getSettings()` to merge DB values with env config for the new fields.

Update `updateSettings()` to handle the new fields.

---

## File Summary

### New Files

```
src/lib/server/
  sonarr.ts                          -- Sonarr v3 API client
  radarr.ts                          -- Radarr v3 API client
  automation.ts                      -- Auto-setup orchestration, discovery, quality mapping
  qbit-compat.ts                     -- qBit state translation, torrent info formatting

src/routes/api/v2/
  auth/login/+server.ts
  app/version/+server.ts
  app/webapiVersion/+server.ts
  app/preferences/+server.ts
  torrents/add/+server.ts
  torrents/info/+server.ts
  torrents/properties/+server.ts
  torrents/files/+server.ts
  torrents/delete/+server.ts
  torrents/setCategory/+server.ts
  torrents/createCategory/+server.ts
  torrents/categories/+server.ts
  torrents/setShareLimits/+server.ts
  torrents/topPrio/+server.ts
  torrents/setForceStart/+server.ts

src/routes/api/automation/
  status/+server.ts
  setup/+server.ts
  webhook/+server.ts
  calendar/+server.ts
  queue/+server.ts
  history/+server.ts
  series/+server.ts
  series/[id]/+server.ts
  series/[id]/episodes/+server.ts
  series/[id]/search/+server.ts
  movies/+server.ts
  movies/[id]/+server.ts
  movies/[id]/search/+server.ts
  profiles/+server.ts

src/routes/api/notifications/
  +server.ts
  [id]/read/+server.ts
  read-all/+server.ts
  stream/+server.ts

src/routes/api/media/[id]/
  quality-history/+server.ts
  rollback/+server.ts

src/routes/(app)/settings/
  +layout.svelte
  +layout.server.ts
  +page.svelte
  account/+page.svelte
  automation/+page.svelte
  connections/+page.svelte
  notifications/+page.svelte

src/lib/components/
  SettingsNav.svelte (inline in layout)
  QualityPresetPicker.svelte
  MonitorToggle.svelte
  NotificationBell.svelte
  QualityBadge.svelte

src/lib/queries/
  automation-queries.ts

src/lib/mutations/
  automation-mutations.ts

drizzle/
  0007_sonarr_radarr_integration.sql
```

### Modified Files

```
docker/docker-compose.yml           -- Add sonarr, radarr services + volumes
src/lib/config.ts                   -- Add sonarr/radarr config
src/lib/server/db/schema.ts         -- Add quality_history, notification, qbit_category tables;
                                       modify media + configuration tables
src/lib/server/db.ts                -- Add repository methods for new tables
src/lib/server/settings.ts          -- Add sonarr/radarr/automation settings
src/lib/server/scheduler.ts         -- Add qualityHistoryCleanupScheduler
src/hooks.server.ts                 -- Auth bypass for /api/v2/*, start cleanup scheduler
src/lib/query-keys.ts               -- Add automation + notification query keys
src/lib/components/Layout.svelte    -- Add NotificationBell, update nav link /account -> /settings
src/routes/(app)/account/+page.svelte -- Redirect to /settings/account
src/routes/(app)/browse/+page.svelte  -- Add "Add to Sonarr/Radarr" actions
.env.example                        -- Add SONARR_*/RADARR_* vars
```

---

## Implementation Phases (Execution Order)

| Phase | What | Dependencies | Estimated Effort |
|---|---|---|---|
| **1** | Docker stack + config | None | Small |
| **2** | Database schema + migration | None | Small |
| **3** | qBit compat API (12 endpoints) | Phase 2 | Large — core bridge |
| **4** | Sonarr/Radarr API clients | None | Medium |
| **5** | Auto-setup orchestration | Phase 3 + 4 | Medium |
| **6** | Plank API routes (automation proxy) | Phase 4 | Medium |
| **7** | Webhook receiver + notifications | Phase 2 + 5 | Medium |
| **8** | Settings UI redesign | Phase 6 | Medium |
| **9** | Deep UI integration (browse, detail pages) | Phase 6 + 7 | Large |
| **10** | TanStack Query integration | Phase 6 + 7 | Small |
| **11** | Settings module update | Phase 2 | Small |

**Parallelizable:** Phases 1-2 can run together. Phase 3 and Phase 4 can run in parallel. Phase 8 can start in parallel with Phase 7.

**Critical path:** Phase 3 (qBit compat API) is the most complex and highest-risk piece. Get this working end-to-end with a real Sonarr instance before proceeding with the UI work.

---

## Testing Strategy

1. **qBit compat API:** Set up a real Sonarr/Radarr instance in Docker. Configure them to use Plank as the qBit download client. Trigger a manual search and verify:
   - Auth works (login returns SID cookie)
   - `torrents/add` triggers a real WebTorrent download
   - `torrents/info` returns accurate progress
   - Download completes and Sonarr/Radarr recognize it as complete
   - Files stay in Plank's `data/library/{uuid}/` structure

2. **Auto-setup:** Fresh Docker stack. Run auto-setup. Verify Sonarr/Radarr are configured with Plank as download client, correct root folder, disabled rename, webhook set up, and Prowlarr synced.

3. **End-to-end automation:** Add a TV show via Plank's browse page -> Sonarr. Wait for Sonarr to search, grab, and send to Plank. Verify the episode appears in Plank's library with correct metadata.

4. **Quality upgrade:** Add a movie at 720p. Configure Radarr to upgrade to 1080p. When upgrade completes, verify quality_history record exists, notification is created, and rollback works within 48 hours.

5. **Wishlist:** Add a movie that has no torrent available. Verify it appears in Radarr as monitored. When a torrent becomes available (or mock it), verify auto-download triggers.
