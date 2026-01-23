<script lang="ts">
    import { Film, Loader2, TrendingUp } from 'lucide-svelte';
    import { goto } from '$app/navigation';
    import TorrentCard from '$lib/components/TorrentCard.svelte';
    import type { BrowseItem } from '$lib/server/tmdb';

    interface Props {
        data: {
            items: BrowseItem[];
            page: number;
            totalPages: number;
            type: 'trending' | 'popular';
        };
    }

    let { data }: Props = $props();

    type Tab = 'trending' | 'popular';

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
    let activeTab = $state<Tab>(data.type);
    let addingItems = $state<Set<number>>(new Set());
    let resolvingItems = $state<Set<number>>(new Set());

    // Data State - initialized from server data
    let items = $state(data.items);
    let isLoading = $state(false);
    let isFetchingMore = $state(false);
    let currentPage = $state(data.page);
    let totalPages = $state(data.totalPages);
    let error = $state<string | null>(null);

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

    // Fetch browse data from API for pagination
    async function fetchBrowse(
        type: Tab,
        page: number
    ): Promise<{
        items: BrowseItem[];
        page: number;
        totalPages: number;
    }> {
        const response = await fetch(`/api/browse?type=${type}&page=${page}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status}`);
        }
        return response.json();
    }

    // Load more items (pagination)
    async function loadMore() {
        if (isFetchingMore || !hasMore) {
            return;
        }

        isFetchingMore = true;
        const nextPage = currentPage + 1;

        try {
            const response = await fetchBrowse(activeTab, nextPage);
            items = [...items, ...response.items];
            currentPage = response.page;
            totalPages = response.totalPages;
        } catch (err) {
            console.error('Failed to load more:', err);
        } finally {
            isFetchingMore = false;
        }
    }

    // Load data when tab changes
    async function loadData(tab: Tab) {
        isLoading = true;
        error = null;
        items = [];
        currentPage = 1;

        try {
            const response = await fetchBrowse(tab, 1);
            items = response.items;
            currentPage = response.page;
            totalPages = response.totalPages;
        } catch (err) {
            console.error('Failed to load browse data:', err);
            error = 'Failed to load content. Please try again.';
        } finally {
            isLoading = false;
        }
    }

    // Watch for tab changes
    $effect(() => {
        if (activeTab !== data.type) {
            loadData(activeTab);
        }
    });

    // Intersection observer for infinite scroll
    $effect(() => {
        if (!loadMoreTrigger) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry.isIntersecting && hasMore && !isFetchingMore && !isLoading) {
                    loadMore();
                }
            },
            { rootMargin: '200px' }
        );

        observer.observe(loadMoreTrigger);

        return () => observer.disconnect();
    });

    function setTab(tab: Tab) {
        if (tab === activeTab) {
            return;
        }
        activeTab = tab;
    }

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

            items = items.map((i) =>
                i.tmdbId === item.tmdbId
                    ? { ...i, magnetLink: result.torrent?.magnetLink, needsResolve: false }
                    : i
            );

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

<div class="min-h-screen pb-20">
    <!-- Header -->
    <div class="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <!-- Tab Navigation -->
        <div class="flex border-b border-border">
            <button
                type="button"
                onclick={() => setTab('trending')}
                class="flex-1 py-3 text-sm font-medium transition-colors border-b-2 flex items-center justify-center gap-1.5 {activeTab ===
				'trending'
					? 'border-primary text-primary'
					: 'border-transparent text-muted-foreground hover:text-foreground'}"
            >
                <TrendingUp class="w-4 h-4" />
                Trending
            </button>
            <button
                type="button"
                onclick={() => setTab('popular')}
                class="flex-1 py-3 text-sm font-medium transition-colors border-b-2 flex items-center justify-center gap-1.5 {activeTab ===
				'popular'
					? 'border-primary text-primary'
					: 'border-transparent text-muted-foreground hover:text-foreground'}"
            >
                <Film class="w-4 h-4" />
                Popular
            </button>
        </div>
    </div>

    <!-- Content -->
    <div class="p-4">
        {#if isLoading}
            <!-- Loading Skeleton -->
            <div
                class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
            >
                {#each Array(12) as _}
                    <div class="aspect-2/3 rounded-lg bg-accent animate-pulse"></div>
                {/each}
            </div>
        {:else if error}
            <!-- Error State -->
            <div class="text-center py-12">
                <p class="text-destructive mb-4">{error}</p>
                <button
                    type="button"
                    onclick={() => loadData(activeTab)}
                    class="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
                >
                    Try Again
                </button>
            </div>
        {:else if items.length === 0}
            <!-- Empty State -->
            <div class="text-center py-12">
                <p class="text-muted-foreground">No content available</p>
            </div>
        {:else}
            <!-- Movie Grid -->
            <div
                class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
            >
                {#each items as item (item.tmdbId)}
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
                <div bind:this={loadMoreTrigger} class="flex justify-center py-8">
                    {#if isFetchingMore}
                        <Loader2 class="w-6 h-6 animate-spin text-primary" />
                    {:else}
                        <span class="text-muted-foreground text-sm">Scroll for more</span>
                    {/if}
                </div>
            {/if}
        {/if}
    </div>
</div>
