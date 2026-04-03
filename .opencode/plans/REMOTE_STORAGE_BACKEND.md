# Bring Your Own Storage — Implementation Plan

## Overview

Implement a pluggable storage backend system using the Strategy/Adapter pattern. A common `StorageAdapter` interface abstracts all file operations, with per-provider implementations. Each organization can configure its own storage backend. Temp torrent downloads remain on local disk; only finalized media, images, and subtitles route through the adapter.

## Goals

1. Abstract file storage behind a `StorageAdapter` interface
2. Support Local/NAS and S3-compatible providers (Google Drive + OneDrive deferred to follow-up)
3. Per-organization storage configuration with local fallback
4. Proxy-based streaming (server fetches from storage and streams to client)
5. Background migration when switching storage providers
6. Zero breakage for existing local-only installations

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Library + Images + Subtitles | Covers completed media, avatars, logos, subtitles. Temp downloads stay local (WebTorrent requires local fs). |
| Granularity | Per-organization | Each org picks its own backend. Orgs without config default to local. Media with `organizationId = null` also defaults to local. |
| Streaming | Proxy through server | Server fetches from remote storage and proxies the stream to the client. Simpler, works with all providers. |
| S3 dependency | `@aws-sdk/client-s3` + `@aws-sdk/lib-storage` | Standard AWS SDK v3. Well maintained, handles all edge cases, works with every S3-compatible provider (AWS, MinIO, R2, Backblaze, Wasabi). |
| OAuth providers | Deferred | Google Drive and OneDrive require OAuth2 UI flows and external app registration. Ship Local + S3 first. |
| NAS support | Local adapter with custom `basePath` | NFS/SMB/iSCSI mounts appear as local directories. No separate adapter needed. |
| Migration | Background job | When switching providers, a background job copies all files from old provider to new, updating DB references as it goes. |

---

## StorageAdapter Interface

```typescript
// src/lib/server/storage/types.ts

type StorageProviderType = 'local' | 's3' | 'google_drive' | 'onedrive';

interface StorageAdapter {
  readonly provider: StorageProviderType;

  // Write operations
  write(key: string, data: Buffer | Uint8Array): Promise<void>;
  writeStream(key: string, stream: NodeJS.ReadableStream): Promise<void>;
  writeFromLocalPath(key: string, localPath: string): Promise<void>;

  // Read operations
  read(key: string): Promise<Buffer>;
  readStream(key: string, range?: { start: number; end: number }): Promise<NodeJS.ReadableStream>;

  // Metadata
  exists(key: string): Promise<boolean>;
  metadata(key: string): Promise<{ size: number; lastModified?: Date }>;

  // Delete operations
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;

  // List
  list(prefix: string): Promise<string[]>;

  // Health check
  testConnection(): Promise<{ ok: boolean; error?: string }>;
}
```

### Key design points

- **`key`** is a provider-agnostic relative path (e.g., `library/Movie (2024)/Movie (2024).mp4` or `images/avatars/{userId}/image.jpg`). Never an absolute filesystem path.
- **`writeFromLocalPath`** enables efficient upload from the local temp directory to remote storage without buffering entire video files into memory.
- **`readStream` with `range`** is critical for HTTP 206 range-request video streaming (proxy mode).
- **`deletePrefix`** replaces recursive `fs.rm()` calls for cleaning up entire media directories.
- **`testConnection`** validates credentials and access before saving a storage config.

---

## File Structure

```
src/lib/server/storage/
  types.ts              — StorageAdapter interface, provider config types, StorageProviderType union
  factory.ts            — getStorageAdapter(orgId) factory with instance cache
  local.ts              — LocalStorageAdapter (covers local disk + NAS mounts)
  s3.ts                 — S3StorageAdapter (any S3-compatible: AWS, MinIO, R2, Backblaze, Wasabi)
  migration.ts          — Background storage migration system
  google-drive.ts       — (Future) GoogleDriveStorageAdapter
  onedrive.ts           — (Future) OneDriveStorageAdapter
```

---

## Database Schema

### New table: `storage_config`

```typescript
export const storageConfig = sqliteTable('storage_config', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: 'cascade' }),
  provider: text('provider', { enum: ['local', 's3', 'google_drive', 'onedrive'] }).notNull(),
  config: text('config').notNull(),       // Encrypted JSON — provider-specific credentials
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});
```

### New table: `storage_migrations`

```typescript
export const storageMigrations = sqliteTable('storage_migrations', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  fromProvider: text('from_provider').notNull(),
  toProvider: text('to_provider').notNull(),
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] })
    .default('pending')
    .notNull(),
  totalFiles: integer('total_files').default(0),
  migratedFiles: integer('migrated_files').default(0),
  totalBytes: integer('total_bytes').default(0),
  migratedBytes: integer('migrated_bytes').default(0),
  error: text('error'),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});
```

### Provider config shapes (stored as encrypted JSON in `storage_config.config`)

**Local / NAS:**
```json
{ "basePath": "/mnt/nas/plank" }
```

**S3-compatible:**
```json
{
  "endpoint": "https://s3.us-east-1.amazonaws.com",
  "region": "us-east-1",
  "bucket": "my-media-bucket",
  "accessKeyId": "AKIA...",
  "secretAccessKey": "...",
  "prefix": "plank/"
}
```

**Google Drive (future):**
```json
{
  "folderId": "1abc...",
  "clientId": "...",
  "clientSecret": "...",
  "accessToken": "...",
  "refreshToken": "..."
}
```

**OneDrive (future):**
```json
{
  "driveId": "...",
  "folderId": "...",
  "clientId": "...",
  "clientSecret": "...",
  "accessToken": "...",
  "refreshToken": "..."
}
```

### File path migration

`media.filePath` and `subtitles.filePath` currently store **absolute** paths like `/path/to/data/library/Movie (2024)/Movie (2024).mp4`. These must become **relative storage keys** like `library/Movie (2024)/Movie (2024).mp4`.

A Drizzle migration will:
1. Strip the `config.paths.data` prefix from all `media.filePath` values
2. Strip the `config.paths.data` prefix from all `subtitles.filePath` values
3. Handle edge cases (null values, already-relative paths)

---

## Storage Factory

```typescript
// src/lib/server/storage/factory.ts

const adapterCache = new Map<string, StorageAdapter>();

async function getStorageAdapter(organizationId: string | null): Promise<StorageAdapter> {
  // Null org or no config → default local adapter at config.paths.data
  if (!organizationId) {
    return getDefaultLocalAdapter();
  }

  const cached = adapterCache.get(organizationId);
  if (cached) return cached;

  const storageConf = await db.query.storageConfig.findFirst({
    where: eq(storageConfig.organizationId, organizationId),
  });

  if (!storageConf) {
    return getDefaultLocalAdapter();
  }

  const decryptedConfig = JSON.parse(decrypt(storageConf.config));
  const adapter = createAdapter(storageConf.provider, decryptedConfig);
  adapterCache.set(organizationId, adapter);
  return adapter;
}
```

Cache invalidation: clear the cached adapter when an org's storage config is updated/deleted.

---

## Refactoring Plan — Files That Need Changes

### Phase 2 changes (refactor existing code to use adapters)

| File | Current | After |
|------|---------|-------|
| `library-paths.ts` | Returns absolute paths via `path.join(config.paths.library, ...)` | Returns relative storage keys like `library/Title (Year)/filename.mp4` |
| `torrent.ts` | `fs.copyFile` in `moveToLibrary()`, `fs.rm` in `deleteMediaFiles()` | `adapter.writeFromLocalPath(key, localPath)` for finalization, `adapter.deletePrefix(prefix)` for cleanup. Active-download streaming (WebTorrent file objects) unchanged. |
| `transcoder.ts` | `fs.copyFile`, `fs.rename`, `fs.unlink` for finalization | Transcoding stays local (ffmpeg needs local files). After finalization, upload via `adapter.writeFromLocalPath()`, then clean up local temp. |
| `storage.ts` | `ImageStorageService` with direct `fs.writeFile`, `fs.readFile`, `fs.unlink` | Rewrite to delegate to the storage adapter. Keep same public API surface. |
| `image-processing.ts` | Calls `imageStorage.save()` and `imageStorage.delete()` | Minimal changes — uses updated `ImageStorageService` |
| `subtitles.ts` | `fs.readdir` to discover sidecar files | Use `adapter.list(prefix)` to discover subtitle files in the media directory |
| `opensubtitles.ts` | `fs.writeFile` + `fs.mkdir` for downloaded subtitle files | Use `adapter.write(key, data)` |
| `stream/+server.ts` | `existsSync`, `statSync`, `createReadStream` for completed files | Use `adapter.metadata(key)` for file size, `adapter.readStream(key, range)` for range-request proxying. Active-download path (WebTorrent in-memory streaming) unchanged. |
| `images/[...path]/+server.ts` | `fs.readFile` from `config.paths.data` | Use `adapter.read(key)` |
| `subtitles/[subtitleId]/+server.ts` | `fs.readFile` / `fs.unlink` | Use `adapter.read(key)` / `adapter.delete(key)` |

### Critical invariant

**Temp downloads always stay local.** The flow becomes:

```
1. WebTorrent downloads to config.paths.temp/{mediaId}/{infohash}/   (always local disk)
2. Transcoder finalizes locally if needed                            (always local disk)
3. adapter.writeFromLocalPath(storageKey, localPath)                 (uploads to configured provider)
4. Local temp cleaned up
5. DB stores provider-agnostic storage key
```

For active downloads (not yet complete), the stream route continues to use WebTorrent's in-memory file objects directly. The adapter is only involved for completed, finalized media.

---

## Backend Implementations

### LocalStorageAdapter

Wraps `node:fs/promises`. The simplest adapter — equivalent to what exists today.

- `write` → `fs.writeFile`
- `writeStream` → pipe to `fs.createWriteStream`
- `writeFromLocalPath` → `fs.copyFile` (or `fs.rename` if same filesystem)
- `read` → `fs.readFile`
- `readStream` → `fs.createReadStream` with `{ start, end }` options
- `exists` → `fs.access`
- `metadata` → `fs.stat`
- `delete` → `fs.unlink`
- `deletePrefix` → `fs.rm(dir, { recursive: true })`
- `list` → `fs.readdir` (recursive)
- `testConnection` → verify base path is writable

**NAS**: Identical to local. User sets `basePath` to their mount point (e.g., `/mnt/nas/plank`). The adapter doesn't know or care that it's a network mount.

### S3StorageAdapter

Uses `@aws-sdk/client-s3` and `@aws-sdk/lib-storage`.

- `write` → `PutObjectCommand`
- `writeStream` → `Upload` from `@aws-sdk/lib-storage` (multipart)
- `writeFromLocalPath` → Stream local file into `Upload` (multipart for large video files, handles retries)
- `read` → `GetObjectCommand`, collect body into Buffer
- `readStream` → `GetObjectCommand` with `Range` header, return body stream
- `exists` → `HeadObjectCommand` (catch 404)
- `metadata` → `HeadObjectCommand` → `{ size: ContentLength, lastModified: LastModified }`
- `delete` → `DeleteObjectCommand`
- `deletePrefix` → `ListObjectsV2Command` + `DeleteObjectsCommand` batch (1000 keys per batch)
- `list` → `ListObjectsV2Command` with pagination
- `testConnection` → `HeadBucketCommand`

Works with any S3-compatible endpoint: AWS S3, MinIO, Cloudflare R2, Backblaze B2, Wasabi, DigitalOcean Spaces, etc. The `endpoint` config field makes it provider-agnostic.

Multipart upload thresholds:
- Files < 5MB: single `PutObjectCommand`
- Files >= 5MB: `Upload` with 10MB part size (handled automatically by `@aws-sdk/lib-storage`)

---

## Storage Migration System

### Background migration flow

When an organization switches from Provider A to Provider B:

1. **API call** `POST /api/organizations/[id]/storage/migrate` triggers migration
2. **Enumerate** all `media.filePath` and `subtitles.filePath` rows for the org
3. **Create** a `storage_migrations` row tracking progress
4. **For each file**: stream from old adapter → write to new adapter → update DB row
5. **Track progress**: increment `migratedFiles` and `migratedBytes` after each file
6. **Handle interruption**: on restart, query for `status = 'running'` migrations and resume (skip already-migrated files by checking if they exist in the new provider)
7. **On completion**: update migration status, old provider files can be cleaned up manually (not auto-deleted for safety)

### API for migration status

```
GET  /api/organizations/[id]/storage/migrate    → current migration status + progress
POST /api/organizations/[id]/storage/migrate    → start migration
DELETE /api/organizations/[id]/storage/migrate  → cancel running migration
```

The UI can poll the GET endpoint to show a progress bar.

---

## API Routes

### Storage configuration

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/organizations/[id]/storage` | Get current storage config for org |
| `PUT` | `/api/organizations/[id]/storage` | Create or update storage config |
| `DELETE` | `/api/organizations/[id]/storage` | Remove storage config (reverts to local) |
| `POST` | `/api/organizations/[id]/storage/test` | Test connectivity to configured provider |

### Storage migration

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/organizations/[id]/storage/migrate` | Get migration status + progress |
| `POST` | `/api/organizations/[id]/storage/migrate` | Start background migration |
| `DELETE` | `/api/organizations/[id]/storage/migrate` | Cancel running migration |

---

## Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `@aws-sdk/client-s3` | S3 operations (get, put, delete, head, list) | ~1MB (modular) |
| `@aws-sdk/lib-storage` | Managed multipart upload for large files | ~50KB |

No new dependencies needed for Local adapter (uses `node:fs`).

Google Drive and OneDrive dependencies deferred until those providers are implemented.

---

## Implementation Phases

| Phase | Scope | Effort | Dependencies |
|-------|-------|--------|-------------|
| **1** | `StorageAdapter` interface + types + `LocalStorageAdapter` + factory | Small | None |
| **2** | DB schema: `storage_config` + `storage_migrations` tables + Drizzle migration | Small | Phase 1 |
| **3** | File path migration: convert `media.filePath` and `subtitles.filePath` from absolute → relative | Small | Phase 2 |
| **4** | Refactor `library-paths.ts` to return storage keys | Small | Phase 3 |
| **5** | Refactor `torrent.ts` — `moveToLibrary()` and `deleteMediaFiles()` to use adapter | Medium | Phase 4 |
| **6** | Refactor `transcoder.ts` — post-finalization upload via adapter | Medium | Phase 5 |
| **7** | Refactor `storage.ts` / `image-processing.ts` — images through adapter | Small | Phase 1 |
| **8** | Refactor `subtitles.ts` + `opensubtitles.ts` — subtitle storage through adapter | Small | Phase 1 |
| **9** | Refactor serving routes — stream, images, subtitles to read via adapter | Medium | Phase 5 |
| **10** | `S3StorageAdapter` implementation | Medium | Phase 1, new dep: `@aws-sdk/client-s3` |
| **11** | Storage migration system (`migration.ts` + API routes) | Medium | Phase 10 |
| **12** | Storage settings API routes (CRUD + test connection) | Small | Phase 10 |
| **13** | Settings UI — storage provider config, test connection, migration progress | Medium | Phase 12 |
| **14** | Tests — unit tests for both adapters, integration tests for factory + migration | Medium | Phase 11 |

---

## Security

1. **Credential encryption**: All provider credentials stored as AES-256-GCM encrypted JSON via the existing `encrypt()` / `decrypt()` functions in `src/lib/server/crypto.ts`
2. **No credentials in logs**: Provider configs are never logged. Connection test results return `{ ok: boolean; error?: string }` only.
3. **Org-scoped access**: Storage config API routes enforce that the requesting user is a member of the organization with appropriate role.
4. **Backward compatibility**: Existing local-only installations continue to work with zero config changes. The local adapter is the default.

---

## Testing Strategy

1. **Unit tests** for `LocalStorageAdapter` — file CRUD, range reads, prefix deletion, listing
2. **Unit tests** for `S3StorageAdapter` — mocked `@aws-sdk/client-s3` client
3. **Unit tests** for factory — config resolution, caching, fallback behavior
4. **Unit tests** for migration system — progress tracking, resume after interruption, cancellation
5. **Integration tests** for the full flow: download → finalize → upload to adapter → stream via adapter
6. **Update existing tests**: `storage.test.ts` (ImageStorageService now uses adapter), `stream-route.test.ts` (streaming now uses adapter)

---

## Future Work (Not in this plan)

- **Google Drive adapter** — requires OAuth2 UI flow, Google Cloud Console app registration, token refresh logic
- **OneDrive adapter** — requires OAuth2 UI flow, Azure AD app registration, Microsoft Graph API
- **Pre-signed URL streaming** — for S3, redirect clients to time-limited URLs instead of proxying (reduces server bandwidth)
- **Per-user storage** — let individual users choose storage (currently per-org only)
- **Storage usage tracking** — dashboard showing bytes used per provider per org
- **Automatic cleanup** — delete files from old provider after migration verification period
