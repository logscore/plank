<script lang="ts">
    import { Search } from '@lucide/svelte';
    import { toast } from 'svelte-sonner';
    import { goto } from '$app/navigation';
    import MediaCard from '$lib/components/MediaCard.svelte';
    import TorrentCard from '$lib/components/TorrentCard.svelte';
    import { demoStore } from '$lib/demo/store.svelte';
    import type { BrowseItem } from '$lib/types';
    import { confirmDelete } from '$lib/ui-state.svelte';

    let mode = $state<'library' | 'browse'>('library');
    let query = $state('');
    let addingId = $state<string | null>(null);

    const trimmedQuery = $derived(query.trim());
    const libraryResults = $derived(trimmedQuery.length >= 2 ? demoStore.searchLibrary(trimmedQuery) : []);
    const browseResults = $derived(trimmedQuery.length >= 2 ? demoStore.searchBrowse(trimmedQuery) : []);

    function handleDelete(id: string, e: Event) {
        e.preventDefault();
        e.stopPropagation();
        const media = demoStore.findMedia(id);
        if (!media) {
            return;
        }
        confirmDelete('Remove from library', `Delete ${media.title} from the library?`, () =>
            demoStore.removeMedia(id)
        );
    }

    function handleAddToLibrary(item: BrowseItem) {
        addingId = item.id;
        demoStore.addFromBrowse(item);
        toast.success(`${item.title} added to the library`);
        setTimeout(() => {
            addingId = null;
        }, 550);
    }

    function handleSelectSeason(item: BrowseItem, seasonNumber: number) {
        addingId = item.id;
        demoStore.addFromBrowse(item, seasonNumber);
        toast.success(`${item.title} Season ${seasonNumber} added to the library`);
        setTimeout(() => {
            addingId = null;
        }, 550);
    }
</script>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div class="mb-8 space-y-4">
        <div>
            <h1 class="text-3xl font-semibold tracking-tight">Search</h1>
            <p class="mt-2 text-sm text-muted-foreground">Search the current library or the catalog.</p>
        </div>

		<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
			<div class="grid w-full grid-cols-2 rounded-full border border-white/10 bg-black/40 p-1 sm:inline-flex sm:w-auto">
				<button
					class="inline-flex w-full items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition {mode === 'library' ? 'bg-white/10 text-white' : 'text-muted-foreground'}"
					onclick={() => (mode = 'library')}
				>
                    Library
                </button>
				<button
					class="inline-flex w-full items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition {mode === 'browse' ? 'bg-white/10 text-white' : 'text-muted-foreground'}"
					onclick={() => (mode = 'browse')}
				>
                    Browse
                </button>
            </div>

            <div class="relative flex-1">
                <Search
                    class="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                    bind:value={query}
                    placeholder={mode === 'library' ? 'Search your library' : 'Search catalog titles'}
                    class="h-12 w-full rounded-full border border-input bg-background pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
            </div>
        </div>
    </div>

    {#if trimmedQuery.length < 2}
        <div
            class="rounded-2xl border border-dashed border-white/15 bg-card/40 px-6 py-14 text-center text-sm text-muted-foreground"
        >
            Search all your favorite movies and shows.
        </div>
    {:else if mode === 'library'}
        {#if libraryResults.length > 0}
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {#each libraryResults as media}
                    <MediaCard
                        media={media}
                        seasons={media.type === 'show' ? demoStore.getShowSeasons(media.id) : []}
                        onDelete={handleDelete}
                    />
                {/each}
            </div>
        {:else}
            <div
                class="rounded-2xl border border-dashed border-white/15 bg-card/40 px-6 py-14 text-center text-sm text-muted-foreground"
            >
                No library matches for “{trimmedQuery}”.
            </div>
        {/if}
    {:else if browseResults.length > 0}
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {#each browseResults as item}
                <TorrentCard
                    {item}
                    onAddToLibrary={handleAddToLibrary}
                    onWatchNow={(movie) => goto(`/watch/${movie.id}`)}
                    onSelectSeason={handleSelectSeason}
                    seasons={item.availableSeasons ?? []}
                    seasonsLoading={false}
                    isAdding={addingId === item.id}
                />
            {/each}
        </div>
    {:else}
        <div
            class="rounded-2xl border border-dashed border-white/15 bg-card/40 px-6 py-14 text-center text-sm text-muted-foreground"
        >
            No browse matches for “{trimmedQuery}”.
        </div>
    {/if}
</div>
