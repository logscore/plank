<script lang="ts">
    import { Film, Tv } from '@lucide/svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import ContinueWatchingCard from '$lib/components/ContinueWatchingCard.svelte';
    import MediaCard from '$lib/components/MediaCard.svelte';
    import { demoStore } from '$lib/demo/store.svelte';
    import { confirmDelete } from '$lib/ui-state.svelte';

    const activeTab = $derived(page.url.searchParams.get('type') === 'shows' ? 'shows' : 'movies');
    const items = $derived(activeTab === 'shows' ? demoStore.shows : demoStore.movies);

    function switchTab(next: 'movies' | 'shows') {
        goto(`/?type=${next}`, { replaceState: true, noScroll: true });
    }

    function handleDelete(id: string, e: Event) {
        e.preventDefault();
        e.stopPropagation();
        const media = demoStore.findMedia(id);
        if (!media) {
            return;
        }
        confirmDelete('Remove from library', `Delete ${media.title} from this profile's library?`, () => {
            demoStore.removeMedia(id);
        });
    }
</script>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
            <h1 class="text-3xl font-semibold tracking-tight">Library</h1>
            <p class="mt-2 text-sm text-muted-foreground">Your private media library.</p>
        </div>
        <div class="inline-flex rounded-full border border-white/10 bg-black/40 p-1">
            <button
                class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition {activeTab === 'movies' ? 'bg-white/10 text-white' : 'text-muted-foreground'}"
                onclick={() => switchTab('movies')}
            >
                <Film class="h-4 w-4" />
                Movies
            </button>
            <button
                class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition {activeTab === 'shows' ? 'bg-white/10 text-white' : 'text-muted-foreground'}"
                onclick={() => switchTab('shows')}
            >
                <Tv class="h-4 w-4" />
                TV Shows
            </button>
        </div>
    </div>

    {#if demoStore.continueWatching.length > 0}
        <section class="mb-10 space-y-4">
            <div>
                <h2 class="text-xl font-semibold">Continue Watching</h2>
            </div>
            <div class="no-scrollbar flex gap-4 overflow-x-auto pb-2">
                {#each demoStore.continueWatching as media}
                    <ContinueWatchingCard {media} />
                {/each}
            </div>
        </section>
    {/if}

    {#if items.length > 0}
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {#each items as media}
                <MediaCard
                    media={media}
                    seasons={media.type === 'show' ? demoStore.getShowSeasons(media.id) : []}
                    onDelete={handleDelete}
                />
            {/each}
        </div>
    {:else}
        <div class="rounded-2xl border border-dashed border-white/15 bg-card/40 px-6 py-14 text-center">
            <h2 class="text-xl font-semibold">No {activeTab} yet</h2>
            <p class="mt-2 text-sm text-muted-foreground">
                Browse the catalog or paste a magnet link to seed this profile.
            </p>
        </div>
    {/if}
</div>
