# TV Show Season Selection Implementation Document

## Overview

This document outlines the implementation of a season selection feature for TV shows in the TorrentCard component. The feature will allow users to select and download entire seasons of TV shows directly from the browser interface.

## Current State

- TorrentCard component currently shows TV shows with basic "Add to Library" and "Watch Now" buttons
- Jackett integration exists for searching torrents by IMDB ID
- TMDB integration provides TV show metadata including season information
- No season-specific UI or functionality exists

## Implementation Plan

### Phase 1: UI Enhancement

#### 1.1 Season Button Addition
- Add a new "Add Season" button to TorrentCard for TV shows only with a chevron down icon
- Remove the "Add" and "Watch" buttons
- Only show when `item.mediaType === 'tv'`

#### 1.2 Context Menu Component
- Create new component: `src/lib/components/ui/ContextMenu.svelte`
- Features:
  - Dropdown/overlay menu positioned near the button
  - List of available seasons
  - Loading states for season data
  - Close on outside click
  - Keyboard navigation support

#### 1.3 Season Data Fetching
- Add new TMDB function to get all seasons for a TV show
- Run this query on hover with a short delay before fetching
- Cache season data to avoid repeated API calls
- Handle loading and error states

### Phase 2: Backend Enhancements

#### 2.1 Season-Specific Jackett Search
- Create new function: `searchSeasonTorrent(imdbId: string, seasonNumber: number)`
- Query modifications:
  - Include season-specific terms (e.g., "S01", "Season 1")
  - Exclude single episode patterns (e.g., "E01", "1x01")
  - Filter for season packs/complete seasons

#### 2.2 Search Query Optimization
```typescript
// Example search query patterns
const seasonSearchTerms = [
  `${showTitle} S${seasonNumber.toString().padStart(2, '0')}`,
  `${showTitle} Season ${seasonNumber}`,
  `${showTitle} Complete Season ${seasonNumber}`
];

// Exclude patterns
const excludePatterns = [
  /\bE\d{1,3}\b/i,           // E01, E12, etc.
  /\d{1,2}x\d{1,3}/i,        // 1x01, 12x05, etc.
  /\bEpisode\s*\d+/i         // Episode 1, Episode 12, etc.
];
```

#### 2.3 Torrent Filtering
- Enhance `filterByQuality` to handle TV-specific quality patterns
- Add minimum size thresholds to avoid single episodes
- Prioritize season packs over individual episodes

### Phase 3: Integration

#### 3.1 TorrentCard Component Updates
- Add season selection state management
- Implement context menu positioning logic
- Add handlers for season selection

#### 3.2 Download Integration
- Extend existing download functionality
- Pass season-specific search parameters to Jackett
- Handle season download initiation

## File Structure Changes

### New Files
```
src/lib/components/ui/ContextMenu.svelte
src/lib/components/SeasonSelector.svelte (new or extend existing EpisodeSelector)
```

### Modified Files
```
src/lib/components/TorrentCard.svelte
src/lib/server/jackett.ts
src/lib/server/tmdb.ts
```

## Component Architecture

### ContextMenu.svelte
```typescript
interface Props {
  open: boolean;
  seasons: SeasonData[];
  onSelectSeason: (seasonNumber: number) => void;
  onClose: () => void;
  position: { x: number; y: number };
}
```

### Season Data Structure
```typescript
interface SeasonData {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  year?: number;
  posterPath?: string;
}
```

## Implementation Steps

1. **Create Context Menu Component**
   - Build reusable dropdown UI
   - Add positioning and keyboard support
   - Test basic functionality

2. **Add Season Button to TorrentCard**
   - Detect TV show items
   - Add button with appropriate icon
   - Implement basic toggle functionality

3. **Fetch Season Data**
   - Extend TMDB API calls for season information
   - Use tanstack query for fetching, state management, and caching

4. **Implement Season Search**
   - Modify Jackett search for season-specific queries for tv shows
   - Add filtering logic for season packs
   - Test search quality

5. **Connect Download Flow**
   - Test end-to-end functionality
   - Add error handling

6. **Polish and Refine**
   - Add animations and transitions
   - Improve accessibility
   - Add loading states and error handling
   - Optimize performance

## Technical Considerations

### Performance
- Cache season data to reduce API calls
- Implement lazy loading for large season lists
- Debounce search requests

### Accessibility
- Ensure keyboard navigation works properly
- Add appropriate ARIA labels
- Provide screen reader support

### Error Handling
- Handle TMDB API failures gracefully
- Provide fallback UI when season data is unavailable
- Show meaningful error messages for search failures

### User Experience
- Add loading indicators for async operations
- Provide feedback for successful downloads
- Allow cancellation of long-running operations

## Success Criteria

- [ ] Users can click a seasons button on TV show cards
- [ ] Context menu appears with list of available seasons
- [ ] Selecting a season searches for season-specific torrents
- [ ] Downloads are initiated for complete seasons only
- [ ] Individual episodes are excluded from results
- [ ] Loading states and error handling work correctly
- [ ] Feature is accessible and responsive

## Testing

### Unit Tests
- Test season data parsing
- Test search query generation
- Test filtering logic

### Integration Tests
- Test end-to-end season selection flow
- Test Jackett integration
- Test TMDB integration

### User Testing
- Verify intuitive interaction patterns
- Confirm performance is acceptable
- Validate error handling scenarios

This implementation will significantly improve the TV show browsing experience by providing direct access to season-level content while maintaining the existing functionality for movies and individual show management.
