# Torrent Browse Implementation Design

## Overview

Create a Netflix-style browse interface for recent torrents from YTS (YIFY) as a trusted source, featuring deduplicated content with instant "Add to Library" and "Watch Now" functionality. The implementation will use TanStack Query Svelte for data fetching, TMDB for rich metadata, and local caching for performance.

## Architecture

### Data Flow
```
YTS API → TMDB API → Browser Cache (IndexedDB) → Frontend
```

### Core Components
1. **YTS API Client** - Browser service to fetch YTS data directly
2. **Browse Interface** - Netflix-style grid component with infinite scroll
3. **Content Deduplication** - Smart matching based on TMDB IDs and metadata
4. **Action System** - Instant add/watch functionality
5. **IndexedDB Cache** - Browser storage for metadata and torrent info

## Implementation Plan

### Phase 1: Client-Side Data Layer

#### 1.1 YTS API Client
**Location**: `/src/lib/client/yts.ts`

**Functions**:
- `fetchLatestTorrents(page)` - Latest torrents with pagination
- `fetchTrendingTorrents()` - Trending content
- `searchTorrents(query)` - Search torrents
- `getTorrentDetails(id)` - Individual torrent info

**Data Models**:
```typescript
interface TorrentBrowseItem {
  id: string;
  tmdbId?: number;
  title: string;
  year: number;
  quality: string;
  size: number;
  seeds: number;
  peers: number;
  magnetLink: string;
  poster?: string;
  backdrop?: string;
  genres: string[];
  rating: number;
  addedAt: Date;
}

interface BrowseResponse {
  items: TorrentBrowseItem[];
  hasMore: boolean;
  nextPage?: number;
}
```

#### 1.2 YTS Integration Service
**Location**: `/src/lib/client/yts.ts`

**Features**:
- Fetch latest movies from YTS API
- Filter for verified torrents only
- Extract metadata (quality, size, seeds)
- Generate TMDB search queries
- Deduplication logic based on title + year

#### 1.3 Content Safety Pipeline
```typescript
interface ContentFilter {
  allowedCategories: ['movies', 'tv'];
  minSeeds: 5;
  maxSize: 10 * 1024 * 1024 * 1024; // 10GB
  allowedFormats: ['mp4', 'mkv', 'webm'];
  trustedUploaders: string[];
}
```

### Phase 2: Frontend Browse Interface

#### 2.1 Browse Page Component
**Location**: `/src/routes/browse/+page.svelte`

**Features**:
- Netflix-style poster grid
- Infinite scroll with intersection observer
- Hover effects showing details
- Category filtering (Movies, TV, Genre)
- Quality filtering (720p, 1080p, 4K)

#### 2.2 Torrent Card Component
**Location**: `/src/lib/components/TorrentCard.svelte`

**UI Elements**:
- Poster image with lazy loading
- Title, year, rating display
- Quality and size badges
- Hover overlay with details
- "Add to Library" button
- "Watch Now" button
- Progress indicator for existing downloads

#### 2.3 State Management with TanStack Query
**Location**: `/src/lib/queries/torrent-browse.ts`

```typescript
export const useLatestTorrents = createQuery({
  queryKey: ['torrents', 'latest'],
  queryFn: ({ pageParam }) => fetchLatestTorrents(pageParam),
  getNextPageParam: (lastPage) => lastPage.nextPage,
  staleTime: 5 * 60 * 1000, // 5 minutes
  cacheTime: 30 * 60 * 1000, // 30 minutes
});

export const useTrendingTorrents = createQuery({
  queryKey: ['torrents', 'trending'],
  queryFn: fetchTrendingTorrents,
  staleTime: 10 * 60 * 1000, // 10 minutes
});
```

#### 2.4 Infinite Scroll Implementation
**Location**: `/src/lib/hooks/useInfiniteScroll.ts`

```typescript
export function useInfiniteScroll(
  query: UseInfiniteQueryResult,
  options: IntersectionObserverInit = {}
) {
  const { ref, inView } = useInView({
    threshold: 0.1,
    rootMargin: '100px',
    ...options
  });

  useEffect(() => {
    if (inView && query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  }, [inView, query.hasNextPage, query.isFetchingNextPage]);

  return { ref };
}
```

### Phase 3: Integration & Actions

#### 3.1 Add to Library Flow
```typescript
async function addToLibrary(torrent: TorrentBrowseItem) {
  // 1. Validate torrent safety
  await validateTorrentSafety(torrent);
  
  // 2. Create movie record with TMDB data
  const movie = await createMovieFromTorrent(torrent);
  
  // 3. Start torrent download
  await startDownload(movie.id, torrent.magnetLink);
  
  // 4. Update UI state
  invalidateQueries(['movies']);
  invalidateQueries(['torrents', 'latest']);
}
```

#### 3.2 Watch Now Flow
```typescript
async function watchNow(torrent: TorrentBrowseItem) {
  // 1. Add to library (same as above)
  const movie = await addToLibrary(torrent);
  
  // 2. Navigate to player page
  goto(`/watch/${movie.id}`);
  
  // 3. Start streaming immediately
  startStreaming(movie.id);
}
```

#### 3.3 Bottom Navigation Integration
**Location**: `/src/routes/+layout.svelte`

**Changes**:
- Add "Browse" button to bottom navigation
- Position between "Search" and "Add Movie"
- Use film strip icon from Lucide
- Show active state when on `/browse` route

### Phase 4: TMDB Integration & Caching

#### 4.1 TMDB Enrichment Service
**Location**: `/src/lib/client/tmdb.ts`

**Features**:
- Search TMDB by title + year
- Cache results locally (IndexedDB)
- Batch processing for efficiency
- Fallback to poster-less display if not found

#### 4.2 Local Cache Schema (IndexedDB)
```typescript
interface TMDBCacheItem {
  searchKey: string;
  tmdbId?: number;
  title: string;
  posterPath?: string;
  backdropPath?: string;
  genres: string[];
  voteAverage: number;
  releaseDate?: string;
  cachedAt: Date;
  expiresAt: Date;
}

// IndexedDB setup using Dexie.js
const tmdbCache = new Dexie('TMDBCache');
tmdbCache.version(1).stores({
  cache: '++id, searchKey, tmdbId, title, cachedAt, expiresAt'
});
```

#### 4.3 Cache Management
```typescript
// IndexedDB Cache Service
export class TMDBCacheService {
  async get(searchKey: string): Promise<TMDBCacheItem | null> {
    const item = await tmdbCache.cache.where('searchKey').equals(searchKey).first();
    return item && item.expiresAt > new Date() ? item : null;
  }
  
  async set(item: TMDBCacheItem): Promise<void> {
    await tmdbCache.cache.put(item);
  }
  
  async cleanup(): Promise<void> {
    const expired = await tmdbCache.cache.where('expiresAt').below(new Date()).delete();
    const excess = await tmdbCache.cache.orderBy('cachedAt').limit(10000).delete();
  }
}
```

- TTL: 7 days for metadata
- Background refresh for popular content
- Manual refresh option
- Size-based cleanup (keep 10,000 most recent)

## UI/UX Design

### Browse Interface Layout
```
┌─────────────────────────────────────┐
│ Category Filters: All | Movies | TV  │
├─────────────────────────────────────┤
│ [Poster] [Poster] [Poster] [Poster] │
│ [Poster] [Poster] [Poster] [Poster] │
│ [Poster] [Poster] [Poster] [Poster] │
│           (Infinite Scroll)          │
└─────────────────────────────────────┘
```

### Torrent Card Hover State
```
┌─────────────┐
│   Poster    │
│             │
├─────────────┤
│ Title (2023)│
│ ⭐ 8.5     │
│ 1080p • 2GB │
│             │
│ [Add] [Watch]│
└─────────────┘
```

### Loading States
- Skeleton cards during initial load
- Shimmer effect for new content
- Progressive loading from top to bottom
- Spinners for action buttons

### Responsive Design
- Mobile: 2 columns
- Tablet: 3-4 columns  
- Desktop: 5-6 columns
- 4K: 8+ columns

## Performance Optimizations

### Frontend
1. **Virtual Scrolling** - Only render visible cards
2. **Image Lazy Loading** - Intersection observer for posters
3. **Progressive Image Loading** - Low-quality placeholders
4. **Debounced Search** - 300ms delay for search input
5. **Optimistic Updates** - Instant UI feedback

### Backend
1. **Response Caching** - 5-minute cache for browse endpoints
2. **Batch TMDB Lookups** - Process multiple items simultaneously
3. **Database Indexing** - Optimize query performance
4. **Background Refresh** - Update cache periodically
5. **Compression** - Gzip API responses

## Security & Safety

### Content Verification
1. **Source Validation** - Only YTS (trusted) API endpoints
2. **Content Filtering** - Movies/TV only, verified uploaders
3. **Size Limits** - Maximum 10GB per file
4. **Format Validation** - Allowed video formats only
5. **Seed Requirements** - Minimum seed count threshold

### User Protection
1. **Clear Warnings** - Notify about content legality
2. **User Reports** - System for reporting inappropriate content
3. **Content Removal** - Quick removal of reported items
4. **Privacy** - No tracking of user viewing habits

## Implementation Timeline

### Week 1: Backend Foundation
- YTS integration service
- Content filtering pipeline
- TMDB cache setup
- API endpoints

### Week 2: Frontend Interface
- Browse page component
- Torrent card component
- Infinite scroll implementation
- TanStack Query integration

### Week 3: Actions & Integration
- Add/Watch functionality
- Bottom navigation updates
- Error handling and loading states
- Mobile responsiveness

### Week 4: Polish & Testing
- Performance optimization
- Security hardening
- Cross-browser testing
- User experience refinements

## Dependencies

### New Packages
```json
{
  "@tanstack/svelte-query": "^5.0.0",
  "intersection-observer": "^0.12.0",
  "date-fns": "^3.0.0",
  "dexie": "^3.2.0"
}
```

### Browser Database Options

**IndexedDB (Recommended)**:
- Native browser API with large storage capacity (usually 50%+ of available disk space)
- Asynchronous operations, won't block UI
- Supports complex queries and indexes
- Works offline-first
- Cross-browser compatible

**SQLite Limitations**:
- Cannot directly access SQLite in browser sandbox
- Would require WebAssembly (sql.js) - much larger bundle size
- No native file system access for persistence
- Performance overhead compared to IndexedDB

**Why IndexedDB is Better**:
- Optimized for browser environment
- Smaller bundle impact (especially with Dexie.js wrapper)
- Better performance for key-value operations
- Built-in support for transactions and versioning
- No additional compilation required

### TMDB API
- API key required for movie metadata
- Rate limiting considerations
- Fallback handling for API failures

## Success Metrics

### Performance
- Initial page load < 2 seconds
- Infinite scroll items < 500ms to appear
- Add to library action < 1 second
- 99% uptime for browse API

### User Experience
- No duplicate content visible
- Instant feedback on all actions
- Smooth scrolling and animations
- Mobile-friendly interface

### Content Quality
- 100% verified torrents only
- No malware or inappropriate content
- High-quality video sources
- Accurate metadata matching

This implementation provides a comprehensive Netflix-style torrent browsing experience while maintaining security, performance, and user safety through trusted sources and robust filtering mechanisms.