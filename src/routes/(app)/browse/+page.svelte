<script lang="ts">
    import { Flame, Loader2, Search, Trophy } from 'lucide-svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import JackettSetup from '$lib/components/JackettSetup.svelte';
    import TorrentCard from '$lib/components/TorrentCard.svelte';
    import type { BrowseItem } from '$lib/server/tmdb';

    interface Props {
        data: {
            items: BrowseItem[];
            page: number;
            totalPages: number;
            type: 'trending' | 'popular';
            jackettConfigured: boolean;
            jackettStatus: string;
            hasIndexers: boolean;
            needsSetup: boolean;
        };
    }

    let { data }: Props = $props();

    interface ResolveResponse {
        success: boolean;
        cached?: boolean;
        error?: string;
        message?: string;
        torrent?: {
            imdbId: string;
            tmdbId?: number;
            magnetLink: string;
            infohash: string;
            title: string;
            quality?: string;
            releaseGroup?: string;
            size?: number;
            seeders?: number;
        };
    }

    // UI State
    let addingItems = $state<Set<number>>(new Set());
    let resolvingItems = $state<Set<number>>(new Set());

    // Data State
    let items = $derived(data.items);
    let activeTab = $derived(data.type);
    let currentPage = $derived(data.page);
    let totalPages = $derived(data.totalPages);

    // For infinite scroll loading state
    let isFetchingMore = $state(false);

    // Load more trigger element
    let loadMoreTrigger: HTMLDivElement | null = $state(null);

    const hasMore = $derived(currentPage < totalPages);

    // Resolve torrent from IMDB ID via Jackett
    async function resolveTorrent(item: BrowseItem): Promise<ResolveResponse> {
        const response = await fetch('/api/browse/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imdbId: item.imdbId,
                tmdbId: item.tmdbId,
                title: item.title,
            }),
        });
        if (!response.ok) {
            throw new Error(`Failed to resolve: ${response.status}`);
        }
        return response.json();
    }

    // We need a local state for appended items to support infinite scroll combined with server data
    let appendedItems = $state<BrowseItem[]>([]);

    // When data changes (tab switch), reset appended items
    $effect(() => {
        if (data.type) {
            appendedItems = [];
        }
    });

    // Combined items view
    let displayItems = $derived([...items, ...appendedItems]);

    // Shadow current page for infinite scroll logic
    let localPage = $state(data.page);
    $effect(() => {
        localPage = data.page;
    }); // Sync on data change

    async function loadMore() {
        if (isFetchingMore || localPage >= totalPages) {
            return;
        }

        isFetchingMore = true;
        try {
            // Use explicit tab type from data if available, else page store, else default
            const currentType = data.type || 'trending';
            const response = await fetch(`/api/browse?type=${currentType}&page=${localPage + 1}`);
            if (response.ok) {
                const result = await response.json();
                appendedItems = [...appendedItems, ...result.items];
                localPage = result.page;
            }
        } catch (e) {
            console.error(e);
        } finally {
            isFetchingMore = false;
        }
    }

    // Intersection observer for infinite scroll
    $effect(() => {
        if (!loadMoreTrigger) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry.isIntersecting && localPage < totalPages && !isFetchingMore) {
                    loadMore();
                }
            },
            { rootMargin: '375px' }
        );

        observer.observe(loadMoreTrigger);

        return () => observer.disconnect();
    });

    // Get magnet link - either from cache or by resolving via Jackett
    async function getMagnetLink(item: BrowseItem): Promise<string | null> {
        if (item.magnetLink) {
            return item.magnetLink;
        }

        resolvingItems = new Set(resolvingItems).add(item.tmdbId);

        try {
            const result = await resolveTorrent(item);

            if (!(result.success && result.torrent)) {
                console.error('Failed to resolve torrent:', result.message || result.error);
                return null;
            }

            return result.torrent.magnetLink;
        } finally {
            const updated = new Set(resolvingItems);
            updated.delete(item.tmdbId);
            resolvingItems = updated;
        }
    }

    async function handleAddToLibrary(item: BrowseItem) {
        if (addingItems.has(item.tmdbId) || resolvingItems.has(item.tmdbId)) {
            return;
        }

        const magnetLink = await getMagnetLink(item);
        if (!magnetLink) {
            return;
        }

        addingItems = new Set(addingItems).add(item.tmdbId);

        try {
            const response = await fetch('/api/media', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    magnetLink,
                    title: item.title,
                    year: item.year,
                    tmdbId: item.tmdbId,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to add to library');
            }
        } catch (err) {
            console.error('Failed to add to library:', err);
        } finally {
            const updated = new Set(addingItems);
            updated.delete(item.tmdbId);
            addingItems = updated;
        }
    }

    async function handleWatchNow(item: BrowseItem) {
        if (addingItems.has(item.tmdbId) || resolvingItems.has(item.tmdbId)) {
            return;
        }

        const magnetLink = await getMagnetLink(item);
        if (!magnetLink) {
            return;
        }

        addingItems = new Set(addingItems).add(item.tmdbId);

        try {
            const response = await fetch('/api/media', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    magnetLink,
                    title: item.title,
                    year: item.year,
                    tmdbId: item.tmdbId,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to add to library');
            }

            const media = await response.json();
            goto(`/watch/${media.id}`);
        } catch (err) {
            console.error('Failed to add and watch:', err);
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
                <h1 class="text-xl font-semibold tracking-tight">Browse</h1>
                <!-- The search functionality will be consolidated to the search page with a simple toggle for in library vs browse search -->
                <!-- <div class="relative w-full max-w-xs md:max-w-sm ml-4">
                    <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        type="search"
                        placeholder="Search movies..."
                        class="w-full rounded-full bg-muted/50 pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all border border-transparent focus:border-primary/20"
                    />
                </div> -->
            </div>

            <!-- Tab Navigation -->
            <div class="flex items-center space-x-2 py-2 overflow-x-auto no-scrollbar">
                <a
                    href="/browse?type=trending"
                    data-sveltekit-noscroll
                    class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 {activeTab ===
                    'trending'
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'hover:bg-accent hover:text-accent-foreground'}"
                >
                    <Flame class="w-4 h-4 mr-2" />
                    Trending
                </a>
                <a
                    href="/browse?type=popular"
                    data-sveltekit-noscroll
                    class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 {activeTab ===
                    'popular'
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'hover:bg-accent hover:text-accent-foreground'}"
                >
                    <Trophy class="w-4 h-4 mr-2" />
                    Popular
                </a>
            </div>
        </div>
    </div>

    <!-- Content -->
    <div class="container max-w-7xl mx-auto px-4 py-8">
        {#if data.needsSetup}
            <!-- Setup Instructions -->
            <JackettSetup jackettUrl="http://localhost:9117" hasApiKey={data.jackettConfigured} />
        {:else if displayItems.length === 0 && !data.needsSetup}
            <!-- Empty State -->
            <div
                class="text-center py-20 bg-muted/30 rounded-lg border border-dashed border-border mx-auto max-w-2xl"
            >
                <Trophy class="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 class="text-lg font-medium text-foreground mb-1">No content found</h3>
                <p class="text-muted-foreground">Check your indexer and Jackett configuration.</p>
            </div>
        {:else}
            <!-- Movie Grid -->
            <div
                class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
            >
                {#each displayItems as item (item.tmdbId)}
                    <TorrentCard
                        {item}
                        onAddToLibrary={handleAddToLibrary}
                        onWatchNow={handleWatchNow}
                        isAdding={addingItems.has(item.tmdbId)}
                        isResolving={resolvingItems.has(item.tmdbId)}
                    />
                {/each}
            </div>

            <!-- Load More Trigger -->
            {#if hasMore}
                <div bind:this={loadMoreTrigger} class="flex justify-center py-12">
                    {#if isFetchingMore}
                        <div class="flex flex-col items-center gap-2">
                            <Loader2 class="w-6 h-6 animate-spin text-primary" />
                            <span class="text-xs text-muted-foreground"
                                >Loading more movies...</span
                            >
                        </div>
                    {:else}
                        <span class="h-6 block"></span>
                    {/if}
                </div>
            {/if}
        {/if}
    </div>
</div>
