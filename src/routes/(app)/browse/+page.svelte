<script lang="ts">
    import { untrack } from 'svelte';
    import { Flame, Loader2, Trophy } from 'lucide-svelte';
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
            filter: 'all' | 'movie' | 'tv';
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

    // Data State - derive directly from data prop
    let activeTab = $derived(data.type);
    let activeFilter = $derived(data.filter || 'all');
    let totalPages = $derived(data.totalPages);

    // For infinite scroll loading state
    let isFetchingMore = $state(false);

    // Load more trigger element
    let loadMoreTrigger: HTMLDivElement | null = $state(null);

    // Infinite scroll state
    let appendedItems = $state<BrowseItem[]>([]);
    let localPage = $state(untrack(() => data.page));
    let previousUrlKey = $state($page.url.search);

    const hasMore = $derived(localPage < totalPages);

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

    // Reset scroll state when URL changes (tab/filter switch)
    $effect(() => {
        const currentKey = $page.url.search;
        if (currentKey !== previousUrlKey) {
            appendedItems = [];
            localPage = data.page;
            previousUrlKey = currentKey;
        }
    });

    // Combine server data + appended items, deduplicated with unique keys
    let displayItems = $derived.by(() => {
        const seen = new Set<number>();
        const ctx = `${data.type}-${data.filter}`;
        return [...data.items, ...appendedItems]
            .filter((item) => {
                if (seen.has(item.tmdbId)) {
                    return false;
                }
                seen.add(item.tmdbId);
                return true;
            })
            .map((item) => ({ ...item, _key: `${ctx}-${item.tmdbId}` }));
    });

    async function loadMore() {
        if (isFetchingMore || localPage >= totalPages) {
            return;
        }

        isFetchingMore = true;
        try {
            // Use explicit tab/filter type from data if available, else defaults
            const currentType = data.type || 'trending';
            const currentFilter = data.filter || 'all';
            const response = await fetch(
                `/api/browse?type=${currentType}&page=${localPage + 1}&filter=${currentFilter}`
            );
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
            { rootMargin: '400px' }
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
                <h1 class="text-2xl font-semibold tracking-tight">Browse</h1>
            </div>

            <!-- Tab Navigation & Filter -->
            <div class="flex items-center justify-between py-2">
                <div class="flex items-center space-x-2 overflow-x-auto no-scrollbar">
                    <a
                        href="/browse?type=trending&filter={activeFilter}"
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
                        href="/browse?type=popular&filter={activeFilter}"
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

                <!-- Filter Dropdown -->
                <select
                    value={activeFilter}
                    onchange={(e) => {
                        const val = e.currentTarget.value;
                        goto(`/browse?type=${activeTab}&filter=${val}`, {
                            noScroll: true,
                        });
                    }}
                    class="h-9 w-[120px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
        {#if data.needsSetup}
            <!-- Setup Instructions -->
            <JackettSetup jackettUrl="http://localhost:9117" hasApiKey={data.jackettConfigured} />
        {:else if displayItems.length === 0 && !data.needsSetup}
            <!-- Empty State -->
            <div class="text-center py-20 bg-muted/30 rounded-lg border border-dashed border-border mx-auto max-w-2xl">
                <Trophy class="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <h2 class="text-lg font-medium text-foreground mb-1">No content found</h2>
                <p class="text-muted-foreground">Check your indexer and Jackett configuration.</p>
            </div>
        {:else}
            <!-- Movie Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {#each displayItems as item (item._key)}
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
                            <span class="text-xs text-muted-foreground">Loading more movies...</span>
                        </div>
                    {:else}
                        <span class="h-6 block"></span>
                    {/if}
                </div>
            {/if}
        {/if}
    </div>
</div>
