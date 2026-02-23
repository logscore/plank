# Remote Storage Backend Implementation Plan

## Overview

Implement a storage backend system that allows users to save downloaded media to remote storage services (S3, R2, Google Drive, OneDrive, etc.) instead of only local filesystem.

## Goals

1. Abstract file storage operations behind a common interface
2. Support multiple storage backends: S3-compatible, Google Drive, OneDrive
3. Per-organization configuration (each profile has its own storage)
4. Multipart uploads for reliability with large files
5. Seamless streaming playback from remote storage

---

## Architecture

### Core Interface

```typescript
// src/lib/server/storage/backend.ts
interface StorageBackend {
  readonly type: string;
  
  // Upload a local file to remote storage
  upload(localPath: string, remotePath: string, onProgress?: (uploaded: number, total: number) => void): Promise<StorageFile>;
  
  // Delete a file
  delete(remotePath: string): Promise<void>;
  
  // Check if file exists
  exists(remotePath: string): Promise<boolean>;
  
  // Get a URL for streaming (presigned URL or direct URL)
  getStreamUrl(remotePath: string, expiresIn?: number): Promise<string>;
  
  // Optional: download for local caching/proxying
  download?(remotePath: string, localPath: string): Promise<void>;
  
  // Test connection/configuration
  testConnection?(): Promise<{ success: boolean; error?: string }>;
}

interface StorageFile {
  path: string;
  size: number;
  url?: string;
}
```

---

## Database Schema

### New Tables

```typescript
// OAuth connections for Google/Microsoft
export const oauthConnections = sqliteTable('oauth_connections', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id),
  provider: text('provider').notNull(),      // 'google', 'microsoft'
  accessToken: text('access_token'),         // encrypted
  refreshToken: text('refresh_token'),       // encrypted  
  expiresAt: integer('expires_at'),
  scope: text('scope'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
});

// Storage backend configurations
export const storageBackends = sqliteTable('storage_backends', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id),
  name: text('name').notNull(),              // "My R2 Bucket"
  type: text('type').notNull(),              // 'local', 's3', 'google-drive', 'onedrive'
  config: text('config'),                    // JSON (encrypted credentials)
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
});
```

### Modified Tables

```typescript
// Add to media table
export const media = sqliteTable('media', {
  // ... existing fields ...
  filePath: text('file_path'),               // Keep for backward compat
  storageBackendId: text('storage_backend_id'),
  storagePath: text('storage_path'),         // Key/path in remote storage
});

// Add to episodes table
export const episodes = sqliteTable('episodes', {
  // ... existing fields ...
  filePath: text('file_path'),
  storageBackendId: text('storage_backend_id'),
  storagePath: text('storage_path'),
});
```

---

## File Structure

```
src/lib/server/storage/
  index.ts              # Public API: getBackend(), uploadFile(), getStreamUrl()
  backend.ts            # Interface definition
  backends/
    local.ts            # Local filesystem (default, backward compat)
    s3.ts               # S3/R2/Backblaze/Wasabi/MinIO
    google-drive.ts     # Google Drive via googleapis
    onedrive.ts         # OneDrive via Microsoft Graph
  upload.ts             # Multipart upload logic
  oauth.ts              # OAuth flow helpers

src/routes/api/storage/
  backends/
    +server.ts          # GET list, POST create
    [id]/+server.ts     # GET, DELETE
  connect/
    [provider]/+server.ts    # GET - start OAuth flow
  callback/
    [provider]/+server.ts    # GET - OAuth callback
```

---

## Backend Implementations

### S3-Compatible (S3, R2, Backblaze, Wasabi, MinIO)

Stored config (encrypted):
```typescript
{
  endpoint: string;      // https://s3.amazonaws.com or R2 endpoint
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl?: string;    // Custom domain for streaming
}
```

Features:
- Multipart upload for files > 5MB (10MB chunks)
- Presigned URLs for streaming (supports range requests)
- Test connection endpoint

### Google Drive

Stored config (encrypted):
```typescript
{
  folderId: string;      // Root folder ID to store files
}
```

Uses `oauthConnections` table for tokens. Tokens refreshed automatically via refresh_token.

### OneDrive

Stored config (encrypted):
```typescript
{
  folderId: string;      // Root folder ID
}
```

Uses `oauthConnections` table for tokens via Microsoft Graph API.

### Local (Backward Compatible)

Stored config:
```typescript
{
  basePath: string;      // Defaults to config.paths.library
}
```

---

## Upload Flow

### Current Flow
```
1. Download → temp directory
2. Transmux → temp (if needed)
3. Copy → local library via fs.copyFile
4. Cleanup → delete temp
```

### New Flow
```
1. Download → temp directory
2. Transmux → temp (if needed)
3. Upload to remote → await backend.upload(localPath, remotePath)
4. Update DB with storageBackendId + storagePath
5. Cleanup local temp
```

### Multipart Upload (S3)

```typescript
const MULTIPART_THRESHOLD = 5 * 1024 * 1024;  // 5MB
const PART_SIZE = 10 * 1024 * 1024;           // 10MB chunks

async function uploadMultipart(backend, localPath, remotePath, fileSize, onProgress) {
  const uploadId = await backend.createMultipartUpload(remotePath);
  const parts = [];
  
  for (let offset = 0; offset < fileSize; offset += PART_SIZE) {
    const partNumber = Math.floor(offset / PART_SIZE) + 1;
    const chunk = await readFileChunk(localPath, offset, PART_SIZE);
    const etag = await backend.uploadPart(remotePath, uploadId, partNumber, chunk);
    parts.push({ partNumber, etag });
    onProgress?.(Math.min(offset + PART_SIZE, fileSize), fileSize);
  }
  
  await backend.completeMultipartUpload(remotePath, uploadId, parts);
}
```

---

## Streaming Playback

### Remote Storage
```typescript
// src/routes/api/media/[id]/stream/+server.ts
export async function GET({ params }) {
  const media = await getMedia(params.id);
  
  if (media.storageBackendId && media.storageBackendId !== 'local') {
    const backend = await getBackend(media.storageBackendId);
    const streamUrl = await backend.getStreamUrl(media.storagePath, 3600);
    throw redirect(302, streamUrl);  // Presigned URL handles range requests
  }
  
  // Local file - existing range request logic
}
```

---

## Dependencies

```json
{
  "@aws-sdk/client-s3": "^3.x",
  "@aws-sdk/s3-request-presigner": "^3.x",
  "googleapis": "^140.x"
}
```

OneDrive uses native `fetch` with Microsoft Graph API (no SDK needed).

---

## Implementation Phases

| Phase | Task | Effort | Status |
|-------|------|--------|--------|
| 1 | Database schema + migrations | Small | Pending |
| 2 | Storage interface + local backend | Small | Pending |
| 3 | S3 backend (multipart + presigned URLs) | Medium | Pending |
| 4 | OAuth flow + Google Drive backend | Medium | Pending |
| 5 | OneDrive backend | Medium | Pending |
| 6 | Integrate into download flow | Medium | Pending |
| 7 | Settings UI | Medium | Pending |
| 8 | Streaming from remote | Small | Pending |

---

## Settings UI

Add "Storage" tab in settings:

1. **List configured backends**
   - Show name, type, status (connected/disconnected)
   - Set as default

2. **Add Storage button**
   - S3/R2/etc: Form for endpoint, bucket, credentials
   - Google Drive: "Connect" button → OAuth flow
   - OneDrive: "Connect" button → OAuth flow

3. **Test connection**
   - Verify credentials work before saving

---

## Security Considerations

1. **Credential encryption**: All stored credentials use AES-256-GCM encryption via the existing `encrypt()` function in `src/lib/server/crypto.ts`

2. **OAuth tokens**: Stored in separate `oauthConnections` table, encrypted, with automatic refresh

3. **Presigned URLs**: Time-limited (1 hour default), scoped to specific object

4. **Backward compatibility**: Local storage remains default; existing installations unaffected

---

## Testing Strategy

1. **Unit tests** for storage interface
2. **Integration tests** with local backend (minio docker container for S3)
3. **Mock OAuth flows** for Google/OneDrive
4. **E2E tests** for download → upload → stream flow
