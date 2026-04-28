<script lang="ts">
    import { Flame, Trophy } from '@lucide/svelte';
    import { toast } from 'svelte-sonner';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import TorrentCard from '$lib/components/TorrentCard.svelte';
    import { demoStore } from '$lib/demo/store.svelte';
    import type { BrowseItem } from '$lib/types';

    const browseType = $derived(page.url.searchParams.get('type') === 'popular' ? 'popular' : 'trending');
    const filter = $derived((page.url.searchParams.get('filter') as 'all' | 'movie' | 'show') || 'all');
    const items = $derived(demoStore.listBrowse(browseType, filter));

    let addingId = $state<string | null>(null);
    let selectedFilter = $state<'all' | 'movie' | 'show'>('all');

    $effect(() => {
        selectedFilter = filter;
    });

    function setParams(nextType = browseType, nextFilter = filter) {
        goto(`/browse?type=${nextType}&filter=${nextFilter}`, { replaceState: true, noScroll: true });
    }

    async function handleAddToLibrary(item: BrowseItem) {
        addingId = item.id;
        demoStore.addFromBrowse(item);
        toast.success(`${item.title} added to the library`);
        setTimeout(() => {
            addingId = null;
        }, 550);
    }

    async function handleSelectSeason(item: BrowseItem, seasonNumber: number) {
        addingId = item.id;
        demoStore.addFromBrowse(item, seasonNumber);
        toast.success(`${item.title} Season ${seasonNumber} added to the library`);
        setTimeout(() => {
            addingId = null;
        }, 550);
    }
</script>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div class="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
            <h1 class="text-3xl font-semibold tracking-tight">Browse</h1>
            <p class="mt-2 text-sm text-muted-foreground">Trending and popular titles from the catalog.</p>
        </div>

        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div class="inline-flex rounded-full border border-white/10 bg-black/40 p-1">
                <button
                    class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition {browseType === 'trending' ? 'bg-white/10 text-white' : 'text-muted-foreground'}"
                    onclick={() => setParams('trending', filter)}
                >
                    <Flame class="h-4 w-4" />
                    Trending
                </button>
                <button
                    class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition {browseType === 'popular' ? 'bg-white/10 text-white' : 'text-muted-foreground'}"
                    onclick={() => setParams('popular', filter)}
                >
                    <Trophy class="h-4 w-4" />
                    Popular
                </button>
            </div>

            <select
                class="h-10 rounded-full border border-input bg-background px-4 text-sm"
                bind:value={selectedFilter}
                onchange={() => setParams(browseType, selectedFilter)}
            >
                <option value="all">All</option>
                <option value="movie">Movies</option>
                <option value="show">TV Shows</option>
            </select>
        </div>
    </div>

    <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {#each items as item, index}
            <TorrentCard
                {item}
                onAddToLibrary={handleAddToLibrary}
                onWatchNow={(movie) => goto(`/watch/${movie.id}`)}
                onSelectSeason={handleSelectSeason}
                seasons={item.availableSeasons ?? []}
                seasonsLoading={false}
                isAdding={addingId === item.id}
                eagerLoad={index < 12}
            />
        {/each}
    </div>
</div>
