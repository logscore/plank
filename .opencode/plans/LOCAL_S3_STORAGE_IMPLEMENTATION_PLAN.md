# Local + S3 Storage Backend Implementation Plan

## Scope

- Providers: `local` and `s3` only.
- Organization-level storage configuration.
- Local fallback when no org storage config exists.
- Temp download/transcode paths remain local.
- Finalized media, images, and subtitles go through storage adapters.
- Google Drive and OneDrive are out of scope.

## Core Design

1. Define a provider-agnostic `StorageAdapter` interface.
2. Store file references as relative storage keys (never absolute paths).
3. Resolve adapters per organization with cache + invalidation.
4. Keep proxy streaming through server with HTTP range support.
5. Encrypt provider configuration payloads at rest.

## File Layout

```
src/lib/server/storage/
  types.ts
  local.ts
  s3.ts
  factory.ts
  storage-settings.ts
```

## Phase 1: Adapter Foundation

### 1.1 Shared types

- Add `StorageAdapter` contract in `src/lib/server/storage/types.ts`.
- Include:
  - write: `write`, `writeStream`, `writeFromLocalPath`
  - read: `read`, `readStream(range)`
  - metadata: `exists`, `metadata`
  - delete: `delete`, `deletePrefix`
  - list: `list`
  - health: `testConnection`
- Add provider config types for `local` and `s3`.

### 1.2 Local adapter

- Implement `LocalStorageAdapter` in `src/lib/server/storage/local.ts`.
- Normalize keys safely and block path traversal.
- Implement recursive list and prefix deletion.
- Implement range reads using `createReadStream` with `{ start, end }`.

### 1.3 S3 adapter

- Implement `S3StorageAdapter` in `src/lib/server/storage/s3.ts`.
- Add dependencies:
  - `@aws-sdk/client-s3`
  - `@aws-sdk/lib-storage`
- Support S3-compatible endpoints with optional `endpoint` and `forcePathStyle`.
- Implement:
  - small writes with `PutObjectCommand`
  - streamed/local path uploads with `Upload`
  - reads/range reads with `GetObjectCommand`
  - exists/metadata with `HeadObjectCommand`
  - list with paginated `ListObjectsV2Command`
  - prefix delete with batched `DeleteObjectsCommand`
  - connection check with bucket/head call

### 1.4 Factory

- Implement `getStorageAdapter(organizationId)` in `src/lib/server/storage/factory.ts`.
- Rules:
  - `organizationId = null` -> default local adapter
  - no row in `storage_config` -> default local adapter
  - provider row -> decrypt config and create adapter
- Add adapter cache and `invalidateStorageAdapterCache(organizationId?)`.

## Phase 2: Database + Persistence

### 2.1 Storage config schema

- Add `storage_config` table:
  - `organization_id` unique FK
  - `provider` enum: `local | s3`
  - encrypted `config` JSON
  - timestamps
- Update Drizzle schema exports/relations.
- Generate migration.

### 2.2 Storage settings service

- Add `src/lib/server/storage/storage-settings.ts`.
- Implement:
  - `getOrganizationStorageSettings(organizationId)`
  - `saveOrganizationStorageSettings(input)`
  - internal remove/reset behavior when external storage disabled
- Validate fields before save:
  - local: base path required
  - s3: bucket, region, access key, secret key required
- Encrypt config payload before DB write.
- Invalidate adapter cache after save/delete.

## Phase 3: Settings UX (Simple + Clean)

### 3.1 Settings page UX

- Simplify settings layout into navigable sections.
- Add storage section with:
  - toggle: **Enable external storage**
  - provider dropdown: **Local / NAS** or **S3-compatible**
  - dynamic provider-specific fields
- Keep visual hierarchy simple and uncluttered.

### 3.2 Form handling

- Update `src/routes/(app)/settings/+page.server.ts`:
  - load org storage settings
  - parse storage form fields
  - save storage config in same settings submission
  - return actionable validation errors
- Enforce org role checks for storage config updates.

## Phase 4: Refactor Existing Storage Usage

### 4.1 Write paths

- Update media finalization flow to use `writeFromLocalPath`.
- Update image writes to use adapter writes.
- Update subtitle downloads/writes to use adapter writes.

### 4.2 Read/stream paths

- Update media stream route:
  - `metadata` for size
  - `readStream(range)` for 206 responses
- Update image route to adapter `read`.
- Update subtitle route to adapter `read`.

### 4.3 Cleanup/listing paths

- Replace direct recursive fs cleanup with `deletePrefix`.
- Replace subtitle sidecar discovery with adapter `list(prefix)`.

## Phase 5: Path Key Migration

- Migrate existing absolute file paths to relative storage keys for:
  - `media.filePath`
  - `subtitles.filePath`
- Strip data-path prefixes safely.
- Handle null/already-relative values without breaking rows.

## Phase 6: Connection Testing

- Add storage test endpoint logic (org-scoped).
- Local test: writable probe under base path.
- S3 test: bucket/head validation.
- Never log credentials.

## Phase 7: Testing Strategy

1. Local adapter unit tests (CRUD, range, list, prefix delete).
2. S3 adapter unit tests with mocked AWS SDK calls.
3. Factory tests (fallback behavior, cache, invalidation).
4. Settings service tests (validation, encryption/decryption).
5. Integration tests for finalize -> store -> stream on local and s3.

## Rollout Criteria

- Existing local-only installs continue with no config changes.
- Org admins can enable and save S3 config successfully.
- Finalized media/images/subtitles work on both local and S3.
- Stream route serves range requests from both providers.
- Tests and type checks pass.
