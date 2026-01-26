# Torrent Browse Search Implementation Document

## Overview

This document outlines the implementation of a comprehensive torrent browse search feature for the Plank media server. The feature will enable users to search for torrents across multiple indexers via Jackett, browse by categories, and filter results by quality, size, and other criteria.

## Current Architecture Analysis

### Existing Components

**Search Infrastructure:**
- `src/lib/server/jackett.ts` - Jackett API client with quality filtering and scoring
- `src/routes/api/search/+server.ts` - Local media library search (FTS + LIKE fallback)
- `src/routes/api/browse/+server.ts` - TMDB trending/popular content with cached torrents

**Torrent Management:**
- `src/lib/server/torrent-cache.ts` - IMDB ID to magnet link caching
- `src/lib/server/torrent.ts` - Torrent downloading and streaming
- `src/lib/config.ts` - Jackett configuration and trusted groups

**Database Schema:**
- `media` table - User's downloaded media
- `torrentCache` table - Cached torrent metadata

### Current Limitations

1. No direct torrent search capability - users can only search their local library
2. Browse API limited to TMDB content - no category-based browsing
3. No advanced filtering (quality, size, seeders, etc.)
4. No search result pagination for large result sets
5. Limited to IMDB ID-based searches via Jackett

## Implementation Plan

### Phase 1: Core Torrent Search API

#### 1.1 New API Endpoint: `/api/torrents/search`

**Location:** `src/routes/api/torrents/search/+server.ts`

**Features:**
- Full-text search across torrent indexers
- Advanced filtering (quality, size, seeders, categories)
- Pagination and sorting options
- Result caching to reduce API calls

**Query Parameters:**
```typescript
interface TorrentSearchParams {
  q?: string;              // Search query
  category?: string;       // Category filter (movies, tv, anime, etc.)
  quality?: string;        // Quality filter (720p, 1080p, 4K)
  minSize?: number;        // Minimum file size in bytes
  maxSize?: number;        // Maximum file size in bytes
  minSeeders?: number;     // Minimum seeders
  trustedGroups?: boolean; // Filter by trusted groups only
  sort?: 'relevance' | 'size' | 'seeders' | 'date';
  order?: 'asc' | 'desc';
  page?: number;           // Pagination (default: 1)
  limit?: number;          // Results per page (default: 20, max: 100)
}
```

**Response Format:**
```typescript
interface TorrentSearchResponse {
  results: TorrentResult[];
  total: number;
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  filters: {
    availableCategories: string[];
    availableQualities: string[];
    sizeRange: { min: number; max: number };
  };
}
```

#### 1.2 Enhanced Jackett Client

**Extensions to `src/lib/server/jackett.ts`:**

**New Functions:**
- `searchTorrents(params: TorrentSearchParams): Promise<JackettResult[]>`
- `getCategories(): Promise<TorrentCategory[]>`
- `parseTorrentMetadata(result: JackettResult): TorrentMetadata`
- `applyFilters(results: JackettResult[], params: TorrentSearchParams): JackettResult[]`

**New Types:**
```typescript
interface TorrentCategory {
  id: string;
  name: string;
  description?: string;
}

interface TorrentMetadata {
  category?: string;
  language?: string;
  resolution?: string;
  codec?: string;
  container?: string;
  source?: string; // BluRay, WEB-DL, etc.
}

interface TorrentResult extends JackettResult {
  category?: string;
  quality?: string;
  language?: string;
  source?: string;
  score: number;
}
```

#### 1.3 Search Result Caching

**New Database Table:** `torrentSearchCache`

**Schema:**
```sql
CREATE TABLE torrent_search_cache (
  id TEXT PRIMARY KEY,
  search_hash TEXT UNIQUE NOT NULL,
  params TEXT NOT NULL, -- JSON string of search parameters
  results TEXT NOT NULL, -- JSON string of results
  total_results INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

CREATE INDEX idx_torrent_search_cache_hash ON torrent_search_cache(search_hash);
CREATE INDEX idx_torrent_search_cache_expires ON torrent_search_cache(expires_at);
```

**Cache Service:** `src/lib/server/search-cache.ts`

### Phase 2: Browse by Categories

#### 2.1 New API Endpoint: `/api/torrents/browse`

**Location:** `src/routes/api/torrents/browse/+server.ts`

**Features:**
- Browse torrents by category
- Recent uploads by category
- Top torrents by category (seeders, size)

**Query Parameters:**
```typescript
interface BrowseParams {
  category: string;           // Required category
  sort?: 'date' | 'seeders' | 'size' | 'title';
  timeframe?: 'day' | 'week' | 'month' | 'year';
  page?: number;
  limit?: number;
}
```

#### 2.2 Category Management Service

**New File:** `src/lib/server/torrent-categories.ts`

**Functions:**
- `getCategories(): Promise<TorrentCategory[]>`
- `getCategoryStats(): Promise<CategoryStats[]>`
- `validateCategory(category: string): boolean`

### Phase 3: Advanced Features

#### 3.1 Search Suggestions API

**Location:** `src/routes/api/torrents/suggestions/+server.ts`

**Features:**
- Autocomplete suggestions as user types
- Popular search terms
- Recently searched terms (per user)

#### 3.2 Torrent Details API

**Location:** `src/routes/api/torrents/[infohash]/+server.ts`

**Features:**
- Detailed torrent information
- File list (if available)
- Similar torrents recommendation
- Health check (tracker status)

#### 3.3 User Search History

**New Database Table:** `userSearchHistory`

**Schema:**
```sql
CREATE TABLE user_search_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  search_query TEXT NOT NULL,
  search_params TEXT, -- JSON of additional params
  result_count INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Phase 4: Frontend Integration

#### 4.1 Search UI Components

**New Components:**
- `TorrentSearch.svelte` - Main search interface
- `TorrentFilters.svelte` - Advanced filtering sidebar
- `TorrentResults.svelte` - Results display with pagination
- `TorrentCard.svelte` - Individual torrent result card

#### 4.2 Browse UI Components

**New Components:**
- `TorrentBrowse.svelte` - Category browsing interface
- `CategoryGrid.svelte` - Category selection grid
- `BrowseResults.svelte` - Browsing results display

#### 4.3 Enhanced Navigation

**Updates to existing navigation:**
- Add "Browse Torrents" to main navigation
- Add search bar to header with autocomplete
- Add torrent search to existing search dropdown

### Phase 5: Performance Optimizations

#### 5.1 Search Indexing

**Implement search result indexing:**
- Cache popular category results
- Pre-fetch trending searches
- Implement search result ranking algorithm

#### 5.2 Rate Limiting

**Add rate limiting to prevent abuse:**
- Per-user rate limits
- Global API rate limits
- Jackett-specific rate limiting

#### 5.3 Background Processing

**Background tasks:**
- Periodic cache cleanup
- Popular searches pre-computation
- Category statistics updates

## Technical Specifications

### Error Handling

**Standardized Error Responses:**
```typescript
interface ApiError {
  error: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}
```

**Error Codes:**
- `PROWLARR_UNAVAILABLE` - Jackett service down
- `INVALID_SEARCH_PARAMS` - Malformed search request
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `SEARCH_TIMEOUT` - Search query timeout

### Security Considerations

**Input Validation:**
- Sanitize all search queries
- Validate parameter ranges
- Prevent SQL injection in cache queries

**Access Control:**
- Require authentication for all endpoints
- Rate limiting per user
- Audit logging for searches

### Performance Targets

**Response Times:**
- Simple search: < 500ms
- Complex filtered search: < 2s
- Category browse: < 300ms
- Cached results: < 50ms

**Cache Durations:**
- Search results: 15 minutes
- Category data: 1 hour
- Popular searches: 30 minutes

## Database Migration Plan

### Migration 1: Torrent Search Cache

```sql
-- Add torrent search cache table
CREATE TABLE torrent_search_cache (
  id TEXT PRIMARY KEY,
  search_hash TEXT UNIQUE NOT NULL,
  params TEXT NOT NULL,
  results TEXT NOT NULL,
  total_results INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

CREATE INDEX idx_torrent_search_cache_hash ON torrent_search_cache(search_hash);
CREATE INDEX idx_torrent_search_cache_expires ON torrent_search_cache(expires_at);
```

### Migration 2: User Search History

```sql
-- Add user search history table
CREATE TABLE user_search_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  search_query TEXT NOT NULL,
  search_params TEXT,
  result_count INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_user_search_history_user_id ON user_search_history(user_id);
CREATE INDEX idx_user_search_history_created_at ON user_search_history(created_at);
```

## Testing Strategy

### Unit Tests

**New Test Files:**
- `src/tests/torrent-search.test.ts` - Search API tests
- `src/tests/torrent-categories.test.ts` - Category management tests
- `src/tests/search-cache.test.ts` - Caching functionality tests

### Integration Tests

**Test Scenarios:**
- End-to-end search workflow
- Category browsing functionality
- Cache invalidation and expiry
- Error handling and edge cases

### Load Testing

**Performance Tests:**
- Concurrent search requests
- Large result set handling
- Cache performance under load

## Rollout Plan

### Phase 1 (Week 1-2)
- Core search API implementation
- Basic Jackett integration
- Essential caching layer

### Phase 2 (Week 3-4)
- Category browsing API
- Enhanced filtering
- Frontend search interface

### Phase 3 (Week 5-6)
- Advanced features (suggestions, details)
- User search history
- Performance optimizations

### Phase 4 (Week 7-8)
- UI refinements
- Comprehensive testing
- Documentation updates

## Success Metrics

### User Engagement
- Increase in torrent searches per user
- Higher conversion from search to download
- Improved user retention

### Technical Performance
- Search response times under targets
- Cache hit rates > 70%
- Reduced Jackett API calls by 60%

### Content Discovery
- Increase in unique content discovered
- Higher quality torrent selections
- Better category exploration

## Future Enhancements

### Advanced Features
- Machine learning-based result ranking
- Content recommendations based on viewing history
- Torrent quality verification system
- Automated subtitle search integration

### Integration Improvements
- Real-time torrent health monitoring
- Direct torrent preview functionality
- Batch download operations
- Torrent playlist management

## Conclusion

This implementation provides a comprehensive torrent search and browsing experience that significantly enhances the Plank media server's content discovery capabilities. The phased approach ensures manageable development while delivering immediate value to users.

The solution balances powerful search functionality with performance considerations through intelligent caching and optimized API design. Extensive error handling and security measures ensure a reliable and secure user experience.