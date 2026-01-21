# Node.js to Bun Migration Plan

## Overview
Migrate Plank from Node.js runtime to Bun for improved performance, faster startup times, and native SQLite support.

## Current State Analysis

### Current Stack
- **Runtime**: Node.js 22 Alpine (Docker)
- **Database**: `better-sqlite3` with Drizzle ORM
- **Package Manager**: npm
- **Build Tool**: Vite (via SvelteKit)
- **Key Dependencies**:
  - `better-sqlite3` - SQLite driver
  - `@ffmpeg-installer/ffmpeg` - FFmpeg binary installer
  - `node-cron` - Cron job scheduler
  - `fluent-ffmpeg` - FFmpeg wrapper
  - Drizzle Kit - Database migrations

### Known Issues
1. **DrizzleKit with Bun**: GitHub issues #5221 and #7343 indicate problems with drizzle-kit picking wrong dialects when running on Bun
2. **Better-sqlite3**: Native Node.js addon that won't work with Bun
3. **WebTorrent Native Dependencies**: `webtorrent@2.5.1` depends on `node-datachannel` which is a native Node.js addon. When running on Bun, it fails with error:
   ```
   Failed to start download for 99f01645-1807-465b-b040-47af031675cb: error: Cannot find module '../../../build/Release/node_datachannel.node' from '/Users/archimedes/Desktop/projects/plank/node_modules/node-datachannel/dist/esm/lib/node-datachannel.mjs'
   ```
   This is a critical blocker as WebTorrent is a core feature of Plank for streaming torrents. The only workaround would be to run WebTorrent in a separate Node.js process via IPC, which adds significant complexity.

**Status**: Migration blocked due to native dependency issues (better-sqlite3, node-datachannel). Cannot proceed with Bun migration without major architectural changes.

---

## Migration Tasks

### Phase 1: Database Migration (Critical)

#### 1.1 Replace better-sqlite3 with bun:sqlite
**File**: `src/lib/server/db/index.ts`

**Changes needed**:
```typescript
// OLD:
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

// NEW:
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
```

**Benefits**:
- Native Bun SQLite driver (3-6x faster than better-sqlite3)
- No native addon compilation issues
- Smaller dependency footprint

#### 1.2 Update package.json dependencies
**Remove**:
- `better-sqlite3`
- `@types/better-sqlite3`

**Add**:
- No additional package needed (bun:sqlite is built-in)

### Phase 2: Docker Configuration

#### 2.1 Update Dockerfile
**File**: `docker/Dockerfile`

**Changes**:
```dockerfile
# OLD:
FROM node:22-alpine
RUN npm install
RUN npm run build
RUN npm prune --production && npm install drizzle-kit
exec node build

# NEW:
FROM oven/bun:latest-alpine
RUN bun install
RUN bun run build
# Keep drizzle-kit for migrations, but install it via bun
RUN bun install drizzle-kit
exec bun run build/index.js
```

**Key considerations**:
- Use official Bun image (`oven/bun:latest-alpine`)
- Replace all `npm` commands with `bun`
- Bun can run the build output directly (no need for separate node execution)
- Healthcheck with curl still works

#### 2.2 Update docker-compose.yml
**File**: `docker/docker-compose.yml`

No structural changes needed, but ensure:
- Volume mounts remain compatible
- Environment variables are preserved
- Port mappings stay the same

#### 2.3 Update entrypoint script
**File**: `docker/entrypoint.sh`

**Changes**:
```bash
# OLD:
npx drizzle-kit migrate
exec node build

# NEW:
bunx drizzle-kit migrate
exec bun run build/index.js
```

**Note**: Using `bunx` instead of `npx` for running packages

### Phase 3: Package.json Scripts

#### 3.1 Update all npm scripts to use bun
**File**: `package.json`

**Current scripts** → **Bun equivalents**:
```json
{
  "scripts": {
    "dev": "vite dev",           // No change - Vite works with Bun
    "build": "vite build",       // No change
    "preview": "vite preview",   // No change
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
    "test": "vitest run",        // Vitest works natively with Bun
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

**Note**: Most scripts work as-is since Bun is npm-compatible. Vite and Vitest run natively on Bun.

### Phase 4: DrizzleKit Integration

#### 4.1 DrizzleKit Docker Issue Resolution
**Problem**: DrizzleKit has known issues when running on Bun, particularly with SQLite dialect detection.

**Solution Options**:

**Option A: Use Node.js for migrations only (Recommended)**
- Keep Node.js runtime specifically for running drizzle-kit commands
- Use Bun for everything else (app runtime, development, testing)

**Implementation in Dockerfile**:
```dockerfile
FROM oven/bun:latest-alpine

# Install Node.js for drizzle-kit compatibility
RUN apk add --no-cache nodejs npm

RUN bun install
RUN bun run build
RUN bun install drizzle-kit

# In entrypoint, use node for drizzle-kit
# npx drizzle-kit migrate  (use node's npm)
```

**Option B: Wait for DrizzleKit fix / Use alternative**
- Monitor drizzle-kit issues for Bun compatibility updates
- Consider using `drizzle-kit push` instead of `migrate` for development
- Use custom migration scripts

**Option C: Separate migration container**
- Create a separate container with Node.js for running migrations
- Main app container runs on Bun
- More complex but isolates the issue

**Recommended approach**: Usethe `bunx` command to run drizzle-kit commands

#### 4.2 Update drizzle.config.ts
**File**: `drizzle.config.ts`

No changes needed - the configuration remains valid. Drizzle ORM's bun-sqlite driver will be automatically selected when using `bun:sqlite`.

### Phase 5: Dependency Updates

#### 5.1 Handle node-cron
**Current usage**: `src/hooks.server.ts`

**Issue**: `node-cron` is Node.js-specific

**Solution**: Try to use node-cron with Bun but if it doesn't work, migrate to croner for scheduling

**Recommendation**: Test `node-cron` with Bun first, as Bun has high Node.js compatibility. If issues arise, migrate to Bun-native alternatives.

#### 5.2 Handle @ffmpeg-installer/ffmpeg
**Current usage**: `src/lib/server/transcoder.ts`

**Issue**: Node.js binary installer

**Solution**: Install FFmpeg system-wide in Docker

**Update Dockerfile**:
```dockerfile
# Install FFmpeg system-wide
RUN apk add --no-cache ffmpeg

# Remove from package.json
# - @ffmpeg-installer/ffmpeg

# Update transcoder.ts:
// OLD:
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// NEW:
// No need to set path - ffmpeg is in system PATH
```

#### 5.3 Update devDependencies
**Review and potentially update**:
- `drizzle-kit` - ensure latest version with better Bun support
- `@sveltejs/vite-plugin-svelte` - works with Bun
- `vitest` - native Bun support
- Keep TypeScript types for any packages

### Phase 6: Documentation Updates

#### 6.1 Update README.md
**Changes needed**:
```bash
# Development section:
OLD:
npm install
npm run dev

NEW:
bun install
bun run dev

# Bare Metal section:
OLD:
npm install
npm run build
npx drizzle-kit migrate
node build

NEW:
bun install
bun run build
bunx drizzle-kit migrate
bun run build/index.js
```

#### 6.2 Update deployment scripts (if any)
- Search for any deployment scripts in `/scripts/` directory
- Update npm references to bun

---

## Testing Checklist

### Pre-Migration
- [ ] Backup existing database
- [ ] Document current app behavior
- [ ] Run full test suite: `bun test`
- [ ] Benchmark current performance

### Post-Migration
- [ ] Verify database migrations work: `bun run db:migrate`
- [ ] Test database queries and relations
- [ ] Verify auth flow works
- [ ] Test video streaming and transcoding
- [ ] Test cron jobs (temp folder cleanup)
- [ ] Verify Docker build: `docker-compose build`
- [ ] Test Docker container startup
- [ ] Verify healthchecks pass
- [ ] Run full test suite again
- [ ] Benchmark new performance
- [ ] Check for memory leaks
- [ ] Monitor error logs

---

## Rollback Plan

If issues arise during or after migration:

1. **Immediate rollback**:
   - Use git to restore changes
   - Revert `package.json` changes
   - Restore previous `Dockerfile`
   - Restore `src/lib/server/db/index.ts`
   - `git checkout -- .`

2. **Data safety**:
   - Database files are unchanged (same SQLite format)
   - Volume mounts persist data
   - No migration needed for data itself

3. **Deployment rollback**:
   - Pull previous Docker image
   - Redeploy with old configuration

---

## Resources

- [Bun SQLite Documentation](https://bun.com/docs/runtime/sqlite)
- [Drizzle ORM with Bun](https://bun.com/docs/guides/ecosystem/drizzle)
- [DrizzleKit Bun Issues](https://github.com/drizzle-team/drizzle-orm/issues/5221)
- [SvelteKit with Bun](https://bun.com/docs/guides/ecosystem/sveltekit)
- [Bun Docker Guide](https://bun.com/docs/guides/ecosystem/docker)
