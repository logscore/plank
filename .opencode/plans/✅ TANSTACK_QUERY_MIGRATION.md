✅# TanStack Query Migration Implementation Document

## Overview

This document outlines the comprehensive migration from manual fetch-based data fetching to TanStack Query (formerly React Query) for improved caching, state management, and data synchronization in the Plank media server. This migration will enhance user experience through intelligent caching, automatic background refetching, and optimistic updates.

## Current State Analysis

### Existing Data Fetching Patterns

**Client-Side Fetching:**
- Direct `fetch()` calls in Svelte components
- Manual loading states and error handling
- No unified caching strategy
- Duplicate requests across components
- Manual invalidation and refresh logic

**Server-Side Loading:**
- SvelteKit `load` functions for initial data
- Server-side data fetching in `+page.server.ts`
- No client-side data synchronization
- Limited reactivity after initial load

**Current Caching Mechanisms:**
- Server-side torrent cache in database
- Browser's native HTTP caching
- Manual state management with Svelte `$state`
- No cache invalidation strategy

### Identified Issues

1. **Race Conditions:** Multiple components can fetch the same data simultaneously
2. **Stale Data:** No automatic refresh mechanisms
3. **Loading States:** Inconsistent loading indicators across components
4. **Error Handling:** Repetitive error handling logic
5. **Cache Management:** No unified cache invalidation
6. **Performance:** Unnecessary network requests
7. **User Experience:** No optimistic updates or background refetching

## Migration Strategy

### Phase 1: Setup and Infrastructure

#### 1.1 Package Installation

```bash
npm install @tanstack/query-core @tanstack/svelte-query
```

#### 1.2 Query Client Setup

**New File:** `src/lib/query-client.ts`

```typescript
import { QueryClient } from '@tanstack/svelte-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (was cacheTime)
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error && typeof error === 'object' && 'status' in error) {
          const status = error.status as number;
          if (status >= 400 && status < 500) return false;
        }
        return failureCount < 3;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});
```

#### 1.3 Query Provider Integration

**Update:** `src/app.html` or root layout

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <!-- existing head content -->
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

**New File:** `src/lib/components/QueryProvider.svelte`

```svelte
<script lang="ts">
  import { QueryClientProvider } from '@tanstack/svelte-query';
  import { queryClient } from '$lib/query-client';
  
  let { children }: { children: import('svelte').Snippet } = $props();
</script>

<QueryClientProvider client={queryClient}>
  {@render children()}
</QueryClientProvider>
```

**Update:** `src/routes/+layout.svelte`

```svelte
<script lang="ts">
  import QueryProvider from '$lib/components/QueryProvider.svelte';
  // existing imports...
</script>

<QueryProvider>
  <slot />
</QueryProvider>
```

### Phase 2: Query Functions and Keys

#### 2.1 Query Keys Factory

**New File:** `src/lib/query-keys.ts`

```typescript
export const queryKeys = {
  // Media queries
  media: {
    all: ['media'] as const,
    lists: () => [...queryKeys.media.all, 'list'] as const,
    list: (type: 'movie' | 'tv' | 'all') => [...queryKeys.media.lists(), type] as const,
    detail: (id: string) => [...queryKeys.media.all, 'detail', id] as const,
    search: (query: string) => [...queryKeys.media.all, 'search', query] as const,
  },
  
  // Browse queries
  browse: {
    all: ['browse'] as const,
    trending: (filter: 'all' | 'movie' | 'tv', page: number) => 
      [...queryKeys.browse.all, 'trending', filter, page] as const,
    popular: (filter: 'all' | 'movie' | 'tv', page: number) => 
      [...queryKeys.browse.all, 'popular', filter, page] as const,
    resolve: (tmdbId: number) => [...queryKeys.browse.all, 'resolve', tmdbId] as const,
  },
  
  // Torrent queries
  torrents: {
    all: ['torrents'] as const,
    search: (params: Record<string, any>) => [...queryKeys.torrents.all, 'search', params] as const,
    browse: (category: string, params: Record<string, any>) => 
      [...queryKeys.torrents.all, 'browse', category, params] as const,
    cache: (imdbIds: string[]) => [...queryKeys.torrents.all, 'cache', imdbIds.sort()] as const,
  },
  
  // System queries
  system: {
    all: ['system'] as const,
    jackett: {
      status: () => [...queryKeys.system.all, 'jackett', 'status'] as const,
      test: () => [...queryKeys.system.all, 'jackett', 'test'] as const,
    },
  },
} as const;
```

#### 2.2 Query Functions

**New File:** `src/lib/queries/media-queries.ts`

```typescript
import type { Media } from '$lib/types';

// Media list queries
export async function fetchMediaList(type: 'movie' | 'tv' | 'all'): Promise<Media[]> {
  const params = type !== 'all' ? `?type=${type}` : '';
  const response = await fetch(`/api/media${params}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ${type} media: ${response.statusText}`);
  }
  
  return response.json();
}

// Media detail queries
export async function fetchMediaDetail(id: string): Promise<Media> {
  const response = await fetch(`/api/media/${id}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch media detail: ${response.statusText}`);
  }
  
  return response.json();
}

// Media search queries
export async function searchMedia(query: string): Promise<Media[]> {
  if (query.length < 2) return [];
  
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  
  if (!response.ok) {
    throw new Error(`Failed to search media: ${response.statusText}`);
  }
  
  return response.json();
}
```

**New File:** `src/lib/queries/browse-queries.ts`

```typescript
import type { BrowseItem } from '$lib/server/tmdb';

export interface BrowseResponse {
  items: BrowseItem[];
  page: number;
  totalPages: number;
}

export async function fetchTrending(
  filter: 'all' | 'movie' | 'tv' = 'all',
  page: number = 1
): Promise<BrowseResponse> {
  const params = new URLSearchParams({
    type: 'trending',
    filter,
    page: page.toString(),
  });
  
  const response = await fetch(`/api/browse?${params}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch trending: ${response.statusText}`);
  }
  
  return response.json();
}

export async function fetchPopular(
  filter: 'all' | 'movie' | 'tv' = 'all',
  page: number = 1
): Promise<BrowseResponse> {
  const params = new URLSearchParams({
    type: 'popular',
    filter,
    page: page.toString(),
  });
  
  const response = await fetch(`/api/browse?${params}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch popular: ${response.statusText}`);
  }
  
  return response.json();
}

export async function resolveTorrent(tmdbId: number): Promise<any> {
  const response = await fetch('/api/browse/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tmdbId }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to resolve torrent: ${response.statusText}`);
  }
  
  return response.json();
}
```

**New File:** `src/lib/queries/torrent-queries.ts`

```typescript
export interface TorrentSearchParams {
  q?: string;
  category?: string;
  quality?: string;
  minSize?: number;
  maxSize?: number;
  minSeeders?: number;
  trustedGroups?: boolean;
  sort?: 'relevance' | 'size' | 'seeders' | 'date';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface TorrentSearchResponse {
  results: any[];
  total: number;
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export async function searchTorrents(params: TorrentSearchParams): Promise<TorrentSearchResponse> {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.set(key, value.toString());
    }
  });
  
  const response = await fetch(`/api/torrents/search?${searchParams}`);
  
  if (!response.ok) {
    throw new Error(`Failed to search the: ${response.statusText}`);
  }
  
  return response.json();
}
```

### Phase 3: Component Migration

#### 3.1 Home Page Migration

**Current:** `src/routes/(app)/+page.svelte`

**Migrated Version:**

```svelte
<script lang="ts">
  import { Film, Tv } from '@lucide/svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import DeleteConfirmationModal from '$lib/components/DeleteConfirmationModal.svelte';
  import MediaCard from '$lib/components/MediaCard.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import type { Media, MediaType } from '$lib/types';
  import { confirmDelete, uiState } from '$lib/ui-state.svelte';
  import { queryKeys } from '$lib/query-keys';
  import { fetchMediaList } from '$lib/queries/media-queries';
  import { addMediaMutation, deleteMediaMutation } from '$lib/mutations/media-mutations';

  // Query hooks
  const moviesQuery = createQuery({
    queryKey: queryKeys.media.list('movie'),
    queryFn: () => fetchMediaList('movie'),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const showsQuery = createQuery({
    queryKey: queryKeys.media.list('tv'),
    queryFn: () => fetchMediaList('tv'),
    staleTime: 2 * 60 * 1000,
  });

  // Mutation hooks
  const addMutation = addMediaMutation();
  const deleteMutation = deleteMediaMutation();

  // Reactive derived values
  const movies = $derived(moviesQuery.data ?? []);
  const shows = $derived(showsQuery.data ?? []);
  const loading = $derived(moviesQuery.isLoading || showsQuery.isLoading);
  const error = $derived(moviesQuery.error || showsQuery.error);

  // UI State
  let activeTab = $state<'movies' | 'tv'>('movies');
  let magnetInput = $state('');
  let selectedType = $state<MediaType | null>(null);

  function handleAddMedia() {
    if (!magnetInput.trim() || !selectedType) return;

    addMutation.mutate({
      magnetLink: magnetInput.trim(),
      type: selectedType,
    }, {
      onSuccess: () => {
        magnetInput = '';
        selectedType = null;
        uiState.toggleAddMediaDialog();
        
        // Invalidate relevant queries
        moviesQuery.invalidate();
        showsQuery.invalidate();
      },
    });
  }

  function handleDeleteMedia(id: string, title: string) {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        // Invalidate queries to trigger refetch
        moviesQuery.invalidate();
        showsQuery.invalidate();
      },
    });
  }
</script>

<!-- Loading state -->
{#if loading}
  <div class="flex items-center justify-center p-8">
    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
{:else if error}
  <div class="p-4 bg-red-50 border border-red-200 rounded-lg">
    <p class="text-red-800">Failed to load library: {error.message}</p>
    <button 
      class="mt-2 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
      onclick={() => {
        moviesQuery.refetch();
        showsQuery.refetch();
      }}
    >
      Retry
    </button>
  </div>
{:else}
  <!-- Main content with tabs and media cards -->
  <div class="space-y-6">
    <!-- Tab navigation -->
    <div class="flex space-x-4 border-b">
      <button
        class="pb-2 px-1 {activeTab === 'movies' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}"
        onclick={() => activeTab = 'movies'}
      >
        <Film class="inline w-4 h-4 mr-1" />
        Movies ({movies.length})
      </button>
      <button
        class="pb-2 px-1 {activeTab === 'tv' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}"
        onclick={() => activeTab = 'tv'}
      >
        <Tv class="inline w-4 h-4 mr-1" />
        TV Shows ({shows.length})
      </button>
    </div>

    <!-- Media grid -->
    {#if activeTab === 'movies'}
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {#each movies as media (media.id)}
          <MediaCard 
            {media} 
            onDelete={() => handleDeleteMedia(media.id, media.title)}
          />
        {/each}
      </div>
    {:else}
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {#each shows as media (media.id)}
          <MediaCard 
            {media} 
            onDelete={() => handleDeleteMedia(media.id, media.title)}
          />
        {/each}
      </div>
    {/if}
  </div>
{/if}

<!-- Add Media Dialog -->
<Dialog bind:open={uiState.addMediaDialogOpen}>
  <div class="p-6">
    <h2 class="text-lg font-semibold mb-4">Add Media</h2>
    
    <Input
      bind:value={magnetInput}
      placeholder="Enter magnet link..."
      class="mb-4"
    />
    
    <div class="flex space-x-2 mb-4">
      <Button
        variant={selectedType === 'movie' ? 'default' : 'outline'}
        onclick={() => selectedType = 'movie'}
      >
        Movie
      </Button>
      <Button
        variant={selectedType === 'tv' ? 'default' : 'outline'}
        onclick={() => selectedType = 'tv'}
      >
        TV Show
      </Button>
    </div>
    
    <div class="flex justify-end space-x-2">
      <Button variant="outline" onclick={() => uiState.toggleAddMediaDialog()}>
        Cancel
      </Button>
      <Button 
        onclick={handleAddMedia}
        disabled={addMutation.isPending || !magnetInput.trim() || !selectedType}
      >
        {addMutation.isPending ? 'Adding...' : 'Add Media'}
      </Button>
    </div>
  </div>
</Dialog>
```

#### 3.2 Browse Page Migration

**Current:** `src/routes/(app)/browse/+page.svelte`

**Migrated Version:**

```svelte
<script lang="ts">
  import { Flame, Loader2, Trophy } from '@lucide/svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import CardSkeleton from '$lib/components/CardSkeleton.svelte';
  import JackettSetup from '$lib/components/JackettSetup.svelte';
  import TorrentCard from '$lib/components/TorrentCard.svelte';
  import type { BrowseItem } from '$lib/server/tmdb';
  import { queryKeys } from '$lib/query-keys';
  import { 
    fetchTrending, 
    fetchPopular, 
    resolveTorrent 
  } from '$lib/queries/browse-queries';
  import { resolveTorrentMutation } from '$lib/mutations/browse-mutations';

  // Extract params from URL
  const type = $derived(($page.url.searchParams.get('type') as 'trending' | 'popular') || 'trending');
  const filter = $derived(($page.url.searchParams.get('filter') as 'all' | 'movie' | 'tv') || 'all');
  const currentPage = $derived(Number.parseInt($page.url.searchParams.get('page') || '1', 10));

  // Query hooks
  const browseQuery = createQuery({
    queryKey: queryKeys.browse[type](filter, currentPage),
    queryFn: () => type === 'trending' 
      ? fetchTrending(filter, currentPage)
      : fetchPopular(filter, currentPage),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const jackettQuery = createQuery({
    queryKey: queryKeys.system.jackett.status(),
    queryFn: async () => {
      const response = await fetch('/api/jackett/status');
      if (!response.ok) throw new Error('Failed to fetch Jackett status');
      return response.json();
    },
    staleTime: 60 * 1000, // 1 minute
  });

  // Mutation
  const resolveMutation = resolveTorrentMutation();

  // Reactive derived values
  const items = $derived(browseQuery.data?.items ?? []);
  const totalPages = $derived(browseQuery.data?.totalPages ?? 0);
  const loading = $derived(browseQuery.isLoading);
  const error = $derived(browseQuery.error);

  // UI State
  let addingItems = $state<Set<number>>(new Set());
  let resolvingItems = $state<Set<number>>(new Set());

  function handleTypeChange(newType: 'trending' | 'popular') {
    const url = new URL($page.url);
    url.searchParams.set('type', newType);
    url.searchParams.delete('page'); // Reset to page 1
    goto(url.toString());
  }

  function handleFilterChange(newFilter: 'all' | 'movie' | 'tv') {
    const url = new URL($page.url);
    url.searchParams.set('filter', newFilter);
    url.searchParams.delete('page'); // Reset to page 1
    goto(url.toString());
  }

  function handlePageChange(newPage: number) {
    const url = new URL($page.url);
    url.searchParams.set('page', newPage.toString());
    goto(url.toString());
  }

  function handleResolveTorrent(item: BrowseItem) {
    if (item.needsResolve === false) return;

    resolvingItems.add(item.tmdbId);
    
    resolveMutation.mutate(item.tmdbId, {
      onSuccess: (result) => {
        resolvingItems.delete(item.tmdbId);
        if (result.success) {
          // Invalidate browse query to show cached torrent
          browseQuery.invalidate();
        }
      },
      onError: () => {
        resolvingItems.delete(item.tmdbId);
      },
    });
  }
</script>

<!-- Jackett Setup State -->
{#if jackettQuery.data?.needsSetup}
  <JackettConfigured />
{:else if jackettQuery.isLoading}
  <div class="flex items-center justify-center p-8">
    <Loader2 class="animate-spin h-8 w-8" />
  </div>
{:else if jackettQuery.error}
  <div class="p-4 bg-red-50 border border-red-200 rounded-lg">
    <p class="text-red-800">Failed to check Jackett status: {jackettQuery.error.message}</p>
  </div>
{:else}
  <!-- Main browse content -->
  <div class="space-y-6">
    <!-- Header with type and filter controls -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold">Browse Content</h1>
        <p class="text-gray-600">Discover trending and popular content</p>
      </div>
      
      <div class="flex gap-2">
        <select
          value={type}
          onchange={(e) => handleTypeChange(e.target.value as 'trending' | 'popular')}
          class="px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="trending">
            <Flame class="inline w-4 h-4 mr-1" />
            Trending
          </option>
          <option value="popular">
            <Trophy class="inline w-4 h-4 mr-1" />
            Popular
          </option>
        </select>
        
        <select
          value={filter}
          onchange={(e) => handleFilterChange(e.target.value as 'all' | 'movie' | 'tv')}
          class="px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="all">All</option>
          <option value="movie">Movies</option>
          <option value="tv">TV Shows</option>
        </select>
      </div>
    </div>

    <!-- Loading state -->
    {#if loading}
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {#each Array(12) as _ (Math.random())}
          <CardSkeleton />
        {/each}
      </div>
    {:else if error}
      <div class="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p class="text-red-800">Failed to load content: {error.message}</p>
        <button 
          class="mt-2 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
          onclick={() => browseQuery.refetch()}
        >
          Retry
        </button>
      </div>
    {:else if items.length === 0}
      <div class="text-center py-12">
        <p class="text-gray-600">No content found for the selected criteria.</p>
      </div>
    {:else}
      <!-- Content grid -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {#each items as item (item.tmdbId)}
          <TorrentCard
            {item}
            onResolve={() => handleResolveTorrent(item)}
            isResolving={resolvingItems.has(item.tmdbId)}
          />
        {/each}
      </div>

      <!-- Pagination -->
      {#if totalPages > 1}
        <div class="flex justify-center items-center space-x-2 mt-8">
          <button
            class="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            disabled={currentPage <= 1}
            onclick={() => handlePageChange(currentPage - 1)}
          >
            Previous
          </button>
          
          <span class="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </span>
          
          <button
            class="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            disabled={currentPage >= totalPages}
            onclick={() => handlePageChange(currentPage + 1)}
          >
            Next
          </button>
        </div>
      {/if}
    {/if}
  </div>
{/if}
```

### Phase 4: Mutations

#### 4.1 Media Mutations

**New File:** `src/lib/mutations/media-mutations.ts`

```typescript
import { createMutation } from '@tanstack/svelte-query';
import { queryClient } from '$lib/query-client';
import { queryKeys } from '$lib/query-keys';

interface AddMediaParams {
  magnetLink: string;
  type: 'movie' | 'tv';
}

export function addMediaMutation() {
  return createMutation({
    mutationFn: async ({ magnetLink, type }: AddMediaParams) => {
      const response = await fetch('/api/media', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ magnetLink, type }),
      });

      if (!response.ok) {
        throw new Error(`Failed to add media: ${response.statusText}`);
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate media list queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.media.lists(),
      });
    },
  });
}

export function deleteMediaMutation() {
  return createMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/media/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete media: ${response.statusText}`);
      }

      return id;
    },
    onSuccess: (deletedId) => {
      // Remove from cache immediately
      queryClient.removeQueries({
        queryKey: queryKeys.media.detail(deletedId),
      });

      // Invalidate media list queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.media.lists(),
      });
    },
  });
}
```

#### 4.2 Browse Mutations

**New File:** `src/lib/mutations/browse-mutations.ts`

```typescript
import { createMutation } from '@tanstack/svelte-query';
import { queryClient } from '$lib/query-client';
import { queryKeys } from '$lib/query-keys';
import { resolveTorrent } from '$lib/queries/browse-queries';

export function resolveTorrentMutation() {
  return createMutation({
    mutationFn: (tmdbId: number) => resolveTorrent(tmdbId),
    onSuccess: (result, tmdbId) => {
      if (result.success && result.torrent) {
        // Invalidate browse queries to show updated torrent cache
        queryClient.invalidateQueries({
          queryKey: queryKeys.browse.all,
        });

        // Invalidate torrent cache queries
        queryClient.invalidateQueries({
          queryKey: queryKeys.torrents.all,
        });
      }
    },
  });
}
```

### Phase 5: Advanced Features

#### 5.1 Prefetching and Background Updates

**Enhanced Navigation:**

```typescript
// In navigation components or link handlers
import { queryClient } from '$lib/query-client';
import { fetchMediaDetail } from '$lib/queries/media-queries';
import { queryKeys } from '$lib/query-keys';

function prefetchMediaDetail(id: string) {
  queryClient.prefetchQuery({
    queryKey: queryKeys.media.detail(id),
    queryFn: () => fetchMediaDetail(id),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Usage in link components
<a 
  href="/movie/{media.id}" 
  onmouseenter={() => prefetchMediaDetail(media.id)}
  onfocus={() => prefetchMediaDetail(media.id)}
>
  {media.title}
</a>
```

#### 5.2 Optimistic Updates

**Enhanced Delete Mutation:**

```typescript
export function deleteMediaMutation() {
  return createMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/media/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete media: ${response.statusText}`);
      }

      return id;
    },
    onMutate: async (id) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.media.lists(),
      });

      // Snapshot the previous value
      const previousMediaLists = queryClient.getQueriesData({
        queryKey: queryKeys.media.lists(),
      });

      // Optimistically update to the new value
      queryClient.setQueriesData(
        { queryKey: queryKeys.media.lists() },
        (old: Media[] | undefined) => {
          return old?.filter((media) => media.id !== id) ?? [];
        }
      );

      // Return a context with the previous value
      return { previousMediaLists };
    },
    onError: (err, id, context) => {
      // Rollback to the previous value
      if (context?.previousMediaLists) {
        context.previousMediaLists.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({
        queryKey: queryKeys.media.lists(),
      });
    },
  });
}
```

#### 5.3 Infinite Query for Pagination

**New File:** `src/lib/queries/infinite-queries.ts`

```typescript
import { createInfiniteQuery } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/query-keys';
import { fetchTrending } from '$lib/queries/browse-queries';

export function useInfiniteTrending(filter: 'all' | 'movie' | 'tv' = 'all') {
  return createInfiniteQuery({
    queryKey: queryKeys.browse.trending(filter, 0), // Page 0 for infinite
    queryFn: ({ pageParam = 1 }) => fetchTrending(filter, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined;
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

#### 5.4 Error Boundaries and Retry Logic

**New Component:** `src/lib/components/QueryErrorBoundary.svelte`

```svelte
<script lang="ts">
  import { QueryErrorBoundary as TanStackQueryErrorBoundary } from '@tanstack/svelte-query';
  
  interface Props {
    fallback: import('svelte').Snippet<{ error: Error; reset: () => void }>;
    children: import('svelte').Snippet;
  }
  
  let { fallback, children }: Props = $props();
</script>

<TanStackQueryErrorBoundary {fallback}>
  {@render children()}
</TanStackQueryErrorBoundary>
```

**Usage Example:**

```svelte
<script lang="ts">
  import QueryErrorBoundary from '$lib/components/QueryErrorBoundary.svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { fetchMediaList } from '$lib/queries/media-queries';
  import { queryKeys } from '$lib/query-keys';

  const moviesQuery = createQuery({
    queryKey: queryKeys.media.list('movie'),
    queryFn: () => fetchMediaList('movie'),
  });
</script>

<QueryErrorBoundary 
  fallback={({ error, reset }) => (
    <div class="p-4 bg-red-50 border border-red-200 rounded-lg">
      <h3 class="text-red-800 font-semibold">Something went wrong</h3>
      <p class="text-red-600">{error.message}</p>
      <button 
        class="mt-2 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
        onclick={reset}
      >
        Try Again
      </button>
    </div>
  )}
>
  <!-- Your content here -->
</QueryErrorBoundary>
```

### Phase 6: Testing and Validation

#### 6.1 Query Testing

**New File:** `src/tests/queries/media-queries.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
import { fetchMediaList } from '$lib/queries/media-queries';

// Mock fetch
global.fetch = vi.fn();

describe('Media Queries', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  it('should fetch media list successfully', async () => {
    const mockMedia = [
      { id: '1', title: 'Test Movie', type: 'movie' },
      { id: '2', title: 'Test Show', type: 'tv' },
    ];

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockMedia,
    });

    const result = await fetchMediaList('movie');

    expect(fetch).toHaveBeenCalledWith('/api/media?type=movie');
    expect(result).toEqual(mockMedia);
  });

  it('should handle fetch errors', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found',
    });

    await expect(fetchMediaList('movie')).rejects.toThrow('Failed to fetch movie media: Not Found');
  });
});
```

#### 6.2 Mutation Testing

**New File:** `src/tests/mutations/media-mutations.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { addMediaMutation } from '$lib/mutations/media-mutations';

describe('Media Mutations', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  it('should add media successfully', async () => {
    const mockResponse = { id: '1', title: 'New Movie' };
    
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const mutation = addMediaMutation();
    
    const result = await mutation.mutateAsync({
      magnetLink: 'magnet:?xt=urn:btih:test',
      type: 'movie',
    });

    expect(fetch).toHaveBeenCalledWith('/api/media', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        magnetLink: 'magnet:?xt=urn:btih:test',
        type: 'movie',
      }),
    });

    expect(result).toEqual(mockResponse);
  });
});
```

## Migration Benefits

### Performance Improvements

1. **Reduced Network Requests:** Intelligent caching prevents duplicate requests
2. **Background Refetching:** Data stays fresh without blocking UI
3. **Prefetching:** Anticipatory data loading for smooth navigation
4. **Request Deduplication:** Multiple components can share the same data

### User Experience Enhancements

1. **Optimistic Updates:** Immediate UI feedback for better perceived performance
2. **Loading States:** Consistent and informative loading indicators
3. **Error Handling:** Graceful error recovery with retry mechanisms
4. **Offline Support:** Cached data available during network issues

### Developer Experience

1. **Declarative Data Fetching:** Cleaner, more maintainable code
2. **Type Safety:** Full TypeScript support with proper typing
3. **Debugging Tools:** Excellent dev tools for query inspection
4. **Testability:** Easier to test data fetching logic

## Rollout Strategy

### Week 1: Infrastructure Setup
- Install TanStack Query
- Set up query client and provider
- Create query keys and basic query functions
- Set up error boundaries

### Week 2: Core Page Migration
- Migrate home page (`/`)
- Migrate browse page (`/browse`)
- Implement basic mutations
- Add error handling

### Week 3: Detail Pages and Advanced Features
- Migrate media detail pages
- Add infinite queries for pagination
- Implement prefetching
- Add optimistic updates

### Week 4: Testing and Optimization
- Comprehensive testing
- Performance optimization
- Cache strategy refinement
- Documentation updates

## Migration Checklist

### Pre-Migration
- [ ] Backup current implementation
- [ ] Set up comprehensive testing
- [ ] Create migration branch
- [ ] Review API endpoints for consistency

### Migration Tasks
- [ ] Install and configure TanStack Query
- [ ] Create query functions and keys
- [ ] Implement error boundaries
- [ ] Migrate components one by one
- [ ] Add comprehensive tests
- [ ] Optimize cache strategies

### Post-Migration
- [ ] Performance testing
- [ ] User acceptance testing
- [ ] Monitor error rates
- [ ] Cache hit rate analysis
- [ ] Documentation updates

## Potential Challenges and Solutions

### Challenge 1: SvelteKit Integration
**Issue:** TanStack Query is React-centric, Svelte integration might have quirks
**Solution:** Use the official Svelte Query adapter, test thoroughly with SvelteKit's navigation

### Challenge 2: Server-Side Rendering
**Issue:** Balancing server-loaded data with client-side queries
**Solution:** Use SvelteKit's `load` functions for initial data, TanStack Query for updates and cache

### Challenge 3: Cache Invalidation
**Issue:** Determining when to invalidate cached data
**Solution:** Implement strategic invalidation based on user actions and data freshness requirements

### Challenge 4: Migration Complexity
**Issue:** Large codebase with many data-fetching patterns
**Solution:** Incremental migration, starting with most-used features

## Conclusion

Migrating to TanStack Query will significantly improve the Plank media server's data fetching capabilities, user experience, and developer productivity. The comprehensive caching, automatic background refetching, and optimistic updates will create a more responsive and reliable application.

The phased migration approach ensures minimal disruption while delivering immediate benefits. With proper testing and optimization, this migration will establish a solid foundation for future feature development and scaling.

The improved data management will be particularly valuable for features like the planned torrent browse search, where intelligent caching and background updates will be essential for handling large result sets and providing smooth user interactions.