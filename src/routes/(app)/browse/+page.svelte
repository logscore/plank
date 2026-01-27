<script lang="ts">
    import { Flame, Trophy } from '@lucide/svelte';
    import { createInfiniteQuery, useQueryClient } from '@tanstack/svelte-query';
    import { toast } from 'svelte-sonner';
    import { goto } from '$app/navigation';
    import { navigating } from '$app/state';
    import { env } from '$env/dynamic/public';
    import CardSkeleton from '$lib/components/CardSkeleton.svelte';
    import ProwlarrSetup from '$lib/components/ProwlarrSetup.svelte';
    import TorrentCard from '$lib/components/TorrentCard.svelte';
    import type { SeasonData } from '$lib/components/ui/ContextMenu.svelte';
    import { createAddFromBrowseMutation } from '$lib/mutations/browse-mutations';
    import { prefetchBothBrowseTabs, prefetchBrowse } from '$lib/prefetch';
    import {
        type BrowseItem,
        type BrowseResponse,
        fetchBrowse,
        fetchSeasons,
        resolveSeasonTorrent,
        resolveTorrent,
        type SeasonSummary,
    } from '$lib/queries/browse-queries';
    import { queryKeys } from '$lib/query-keys';

    interface Props {
        data: {
            items: BrowseItem[];
            page: number;
            totalPages: number;
            type: 'trending' | 'popular';
            filter: 'all' | 'movie' | 'tv';
            prowlarrConfigured: boolean;
            prowlarrStatus: string;
            hasIndexers: boolean;
            needsSetup: boolean;
        };
    }

    let { data }: Props = $props();

    // Mutations
    const addToLibraryMutation = createAddFromBrowseMutation();

    // Query client for caching
    const queryClient = useQueryClient();

    // Derive params from URL
    const activeTab = $derived(data.type);
    const activeFilter = $derived(data.filter || 'all');

    // Infinite query for loading more pages
    const browseQuery = createInfiniteQuery(() => ({
        queryKey: queryKeys.browse.infinite(activeTab, activeFilter),
        queryFn: ({ pageParam }) => fetchBrowse(activeTab, activeFilter, pageParam),
        initialPageParam: 1,
        initialData: {
            pages: [
                {
                    items: data.items,
                    page: data.page,
                    totalPages: data.totalPages,
                },
            ],
            pageParams: [1],
        },
        getNextPageParam: (lastPage: BrowseResponse) => {
            return lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined;
        },
        staleTime: 30 * 60 * 1000, // 30 minutes
    }));

    // UI State
    let addingItems = $state<Set<number>>(new Set());
    let resolvingItems = $state<Set<number>>(new Set());

    // TV show seasons state - keyed by TMDB ID
    // We keep a local reactive cache for the UI to bind to (passed to TorrentCard)
    // The data fetching uses QueryClient for network caching
    // The data fetching uses QueryClient for network caching
    let seasonsCache = $state<Map<number, SeasonData[]>>(new Map());
    let seasonsLoading = $state<Set<number>>(new Set());

    // Load more trigger element
    let loadMoreTrigger: HTMLDivElement | null = $state(null);

    // Flatten and deduplicate items from all pages
    const displayItems = $derived.by(() => {
        const pages = browseQuery.data?.pages ?? [];
        const seen = new Set<number>();
        const ctx = `${activeTab}-${activeFilter}`;

        return pages
            .flatMap((page) => page.items)
            .filter((item) => {
                if (seen.has(item.tmdbId)) {
                    return false;
                }
                seen.add(item.tmdbId);
                return true;
            })
            .map((item) => ({ ...item, _key: `${ctx}-${item.tmdbId}` }));
    });

    const hasMore = $derived(browseQuery.hasNextPage);
    const isFetchingMore = $derived(browseQuery.isFetchingNextPage);

    // Intersection observer for infinite scroll
    $effect(() => {
        if (!loadMoreTrigger) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry.isIntersecting && hasMore && !isFetchingMore) {
                    browseQuery.fetchNextPage();
                }
            },
            { rootMargin: '300px' }
        );

        observer.observe(loadMoreTrigger);

        return () => observer.disconnect();
    });

    // Prefetch both tabs on page load for instant tab switching
    $effect(() => {
        prefetchBothBrowseTabs(activeFilter);
    });

    // Get magnet link - uses QueryClient for caching
    async function getMagnetLink(item: BrowseItem): Promise<string | null> {
        if (item.magnetLink) {
            return item.magnetLink;
        }

        resolvingItems = new Set(resolvingItems).add(item.tmdbId);

        try {
            const result = await queryClient.fetchQuery({
                queryKey: queryKeys.browse.resolve(item.tmdbId),
                queryFn: () =>
                    resolveTorrent({
                        imdbId: item.imdbId,
                        tmdbId: item.tmdbId,
                        title: item.title,
                    }),
                staleTime: 1000 * 60 * 60 * 24, // 24 hours
            });

            if (!(result.success && result.torrent)) {
                console.error('Failed to resolve torrent:', result.message || result.error);
                return null;
            }

            return result.torrent.magnetLink;
        } catch (err) {
            console.error('Failed to resolve torrent:', err);
            return null;
        } finally {
            const updated = new Set(resolvingItems);
            updated.delete(item.tmdbId);
            resolvingItems = updated;
        }
    }

    async function handleAddToLibrary(item: BrowseItem) {
        if (addingItems.has(item.tmdbId)) {
            return;
        }

        // Set adding state immediately to show UI spinner
        addingItems = new Set(addingItems).add(item.tmdbId);

        try {
            const magnetLink = await getMagnetLink(item);
            if (!magnetLink) {
                // If resolution fails, we must clear the adding state
                toast.error('No magnet link found for this title');
                throw new Error('Could not resolve magnet link');
            }

            await addToLibraryMutation.mutateAsync({
                magnetLink,
                title: item.title,
                year: item.year,
                tmdbId: item.tmdbId,
            });
            toast.success('Added to library');
        } catch (err) {
            console.error('Failed to add to library:', err);
            if (err instanceof Error && err.message !== 'Could not resolve magnet link') {
                toast.error('Failed to add to library. No valid magnet link found');
            }
        } finally {
            const updated = new Set(addingItems);
            updated.delete(item.tmdbId);
            addingItems = updated;
        }
    }

    async function handleWatchNow(item: BrowseItem) {
        if (addingItems.has(item.tmdbId)) {
            return;
        }

        // Set adding state immediately to show UI spinner
        addingItems = new Set(addingItems).add(item.tmdbId);

        try {
            const magnetLink = await getMagnetLink(item);
            if (!magnetLink) {
                toast.error('No magnet link found for this title');
                throw new Error('Could not resolve magnet link');
            }

            const media = await addToLibraryMutation.mutateAsync({
                magnetLink,
                title: item.title,
                year: item.year,
                tmdbId: item.tmdbId,
            });
            goto(`/watch/${media.id}`);
        } catch (err) {
            console.error('Failed to add and watch:', err);
            if (err instanceof Error && err.message !== 'Could not resolve magnet link') {
                toast.error('Failed to start playback');
            }
        } finally {
            const updated = new Set(addingItems);
            updated.delete(item.tmdbId);
            addingItems = updated;
        }
    }

    // Prefetch magnet link on hover - runs getMagnetLink in the background
    function handlePrefetch(item: BrowseItem) {
        // Fire and forget - queryClient handles deduplication
        getMagnetLink(item);
    }

    // ==========================================================================
    // TV Show Season Handling
    // ==========================================================================

    // Get seasons for a TV show - handles caching and deduplication
    async function getSeasons(item: BrowseItem): Promise<SeasonData[]> {
        // Return local cached seasons if available (fast path)
        const cached = seasonsCache.get(item.tmdbId);
        if (cached) {
            return cached;
        }

        seasonsLoading = new Set(seasonsLoading).add(item.tmdbId);

        try {
            const response = await queryClient.fetchQuery({
                queryKey: queryKeys.browse.seasons(item.tmdbId),
                queryFn: () => fetchSeasons(item.tmdbId),
                staleTime: 1000 * 60 * 60, // 1 hour
            });

            // Convert SeasonSummary to SeasonData format for the ContextMenu
            const seasonData: SeasonData[] = response.seasons.map((s: SeasonSummary) => ({
                seasonNumber: s.seasonNumber,
                name: s.name,
                episodeCount: s.episodeCount,
                year: s.year,
                posterPath: s.posterPath,
            }));
            seasonsCache = new Map(seasonsCache).set(item.tmdbId, seasonData);
            return seasonData;
        } catch (err) {
            console.error('Failed to fetch seasons:', err);
            return [];
        } finally {
            const updated = new Set(seasonsLoading);
            updated.delete(item.tmdbId);
            seasonsLoading = updated;
        }
    }

    // Prefetch seasons for a TV show on hover - fire and forget
    function handlePrefetchSeasons(item: BrowseItem) {
        if (item.mediaType !== 'tv') {
            return;
        }
        // Fire and forget
        getSeasons(item);
    }

    // Get seasons for a specific item (from cache)
    function getSeasonsForItem(tmdbId: number): SeasonData[] {
        return seasonsCache.get(tmdbId) ?? [];
    }

    // ==========================================================================
    // Season Torrent Prefetching (like movie torrent prefetch)
    // ==========================================================================

    // Get season torrent magnet link - handles caching and deduplication
    async function getSeasonMagnetLink(item: BrowseItem, seasonNumber: number): Promise<string | null> {
        try {
            const result = await queryClient.fetchQuery({
                queryKey: queryKeys.browse.resolveSeason(item.tmdbId, seasonNumber),
                queryFn: () =>
                    resolveSeasonTorrent({
                        tmdbId: item.tmdbId,
                        seasonNumber,
                        showTitle: item.title,
                        imdbId: item.imdbId ?? undefined,
                    }),
                staleTime: 1000 * 60 * 60 * 24, // 24 hours
            });

            if (result.success && result.torrent) {
                return result.torrent.magnetLink;
            }

            console.error('Failed to resolve season torrent:', result.message || result.error);
            return null;
        } catch (err) {
            console.error('Failed to prefetch season torrent:', err);
            return null;
        }
    }

    // Prefetch season torrent on hover in context menu - fire and forget
    function handlePrefetchSeasonTorrent(item: BrowseItem, seasonNumber: number) {
        // Fire and forget
        getSeasonMagnetLink(item, seasonNumber);
    }

    // Handle season selection - resolve and add season torrent to library
    async function handleSelectSeason(item: BrowseItem, seasonNumber: number) {
        if (addingItems.has(item.tmdbId)) {
            return;
        }

        addingItems = new Set(addingItems).add(item.tmdbId);

        try {
            // Get magnet link (uses cache if prefetched, otherwise fetches)
            const magnetLink = await getSeasonMagnetLink(item, seasonNumber);

            if (!magnetLink) {
                console.error('Failed to resolve season torrent');
                toast.error('No magnet link found for this season');
                return;
            }

            // Add to library
            await addToLibraryMutation.mutateAsync({
                magnetLink,
                title: `${item.title} - Season ${seasonNumber}`,
                year: item.year,
                tmdbId: item.tmdbId,
            });
            toast.success('Season added to library');
        } catch (err) {
            console.error('Failed to add season to library:', err);
            toast.error('Failed to add season');
        } finally {
            const updated = new Set(addingItems);
            updated.delete(item.tmdbId);
            addingItems = updated;
        }
    }
</script>

<div class="min-h-screen pb-20 bg-background">
    <!-- Header -->
    <div
        class="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/40 supports-backdrop-filter:bg-background/60"
    >
        <div class="container max-w-7xl mx-auto px-4">
            <!-- Top Bar with Search -->
            <div class="flex items-center justify-between py-3 h-15">
                <h1 class="text-2xl font-semibold tracking-tight">Browse</h1>
            </div>

            <!-- Tab Navigation & Filter -->
            <div class="flex items-center justify-between py-2">
                <div class="flex items-center space-x-2 overflow-x-auto no-scrollbar">
                    <a
                        href="/browse?type=trending&filter={activeFilter}"
                        data-sveltekit-noscroll
                        onmouseenter={() =>
                            prefetchBrowse("trending", activeFilter)}
                        onfocus={() => prefetchBrowse("trending", activeFilter)}
                        class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 {activeTab ===
                        'trending'
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'hover:bg-accent hover:text-accent-foreground'}"
                    >
                        <Flame class="w-4 h-4 mr-2" />
                        Trending
                    </a>
                    <a
                        href="/browse?type=popular&filter={activeFilter}"
                        data-sveltekit-noscroll
                        onmouseenter={() =>
                            prefetchBrowse("popular", activeFilter)}
                        onfocus={() => prefetchBrowse("popular", activeFilter)}
                        class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 {activeTab ===
                        'popular'
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'hover:bg-accent hover:text-accent-foreground'}"
                    >
                        <Trophy class="w-4 h-4 mr-2" />
                        Popular
                    </a>
                </div>

                <!-- Filter Dropdown -->
                <select
                    value={activeFilter}
                    onchange={(e) => {
                        const val = e.currentTarget.value;
                        goto(`/browse?type=${activeTab}&filter=${val}`, {
                            noScroll: true,
                        });
                    }}
                    class="h-9 w-30 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                    <option value="all">All</option>
                    <option value="movie">Movies</option>
                    <option value="tv">TV Shows</option>
                </select>
            </div>
        </div>
    </div>

    <!-- Content -->
    <div class="container max-w-7xl mx-auto px-4 py-8">
        <!-- {#if data.needsSetup} -->
        <!-- Setup Instructions -->
        <!-- <ProwlarrSetup prowlarrUrl={env.PUBLIC_PROWLARR_URL!} hasApiKey={data.prowlarrConfigured} /> -->
        <!-- {:else if displayItems.length === 0 && !data.needsSetup} -->
        {#if displayItems.length === 0 && !data.needsSetup}
            <!-- Empty State -->
            <div class="text-center py-20 bg-muted/30 rounded-lg border border-dashed border-border mx-auto max-w-2xl">
                <Trophy class="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <h2 class="text-lg font-medium text-foreground mb-1">No content found</h2>
                <p class="text-muted-foreground">Check your indexer and Prowlarr configuration.</p>
            </div>
        {:else}
            <!-- Movie Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {#if navigating.to}
                    {#each { length: 12 } as _}
                        <CardSkeleton />
                    {/each}
                {:else}
                    {#each displayItems as item (item._key)}
                        <TorrentCard
                            {item}
                            onAddToLibrary={handleAddToLibrary}
                            onWatchNow={handleWatchNow}
                            onPrefetch={handlePrefetch}
                            onSelectSeason={handleSelectSeason}
                            onPrefetchSeasons={handlePrefetchSeasons}
                            onPrefetchSeasonTorrent={handlePrefetchSeasonTorrent}
                            isAdding={addingItems.has(item.tmdbId)}
                            isResolving={resolvingItems.has(item.tmdbId)}
                            seasons={getSeasonsForItem(item.tmdbId)}
                            seasonsLoading={seasonsLoading.has(item.tmdbId)}
                        />
                    {/each}

                    {#if isFetchingMore}
                        {#each { length: 5 } as _}
                            <CardSkeleton />
                        {/each}
                    {/if}
                {/if}
            </div>

            <!-- Load More Trigger -->
            {#if hasMore && !navigating.to}
                <div bind:this={loadMoreTrigger} class="flex justify-center py-12">
                    {#if !isFetchingMore}
                        <span class="h-6 block"></span>
                    {/if}
                </div>
            {/if}
        {/if}
    </div>
</div>
