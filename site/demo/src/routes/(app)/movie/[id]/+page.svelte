<script lang="ts">
    import { Film, Play, Plus, Trash2 } from '@lucide/svelte';
    import { toast } from 'svelte-sonner';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import Button from '$lib/components/ui/Button.svelte';
    import { demoStore } from '$lib/demo/store.svelte';
    import { formatBytes, formatDate, formatRuntime } from '$lib/demo/utils';
    import { confirmDelete } from '$lib/ui-state.svelte';

    const mediaId = $derived(page.params.id ?? '');
    const media = $derived(demoStore.findMedia(mediaId));
    const inLibrary = $derived(Boolean(media && demoStore.hasInLibrary(media.id)));

    function handleAdd() {
        if (!media) {
            return;
        }
        demoStore.addFromBrowse({
            id: media.id,
            tmdbId: media.tmdbId ?? 0,
            imdbId: media.imdbId,
            title: media.title,
            year: media.year,
            posterUrl: media.posterUrl,
            backdropUrl: media.backdropUrl,
            overview: media.overview,
            voteAverage: null,
            genres: media.genres,
            mediaType: 'movie',
            certification: media.certification,
            needsResolve: false,
            runtime: media.runtime,
            originalLanguage: media.originalLanguage,
            totalSeasons: null,
        });
        toast.success(`${media.title} added to the library`);
    }

    function handleDelete() {
        if (!media) {
            return;
        }
        confirmDelete('Remove movie', `Delete ${media.title} from the library?`, () => {
            demoStore.removeMedia(media.id);
            goto('/?type=movies');
        });
    }
</script>

{#if media}
    <div class="relative min-h-screen overflow-hidden">
        {#if media.backdropUrl || media.posterUrl}
            <picture>
                {#if media.backdropUrl}
                    <source media="(min-width: 1024px)" srcset={media.backdropUrl} />
                {/if}
                <img
                    src={media.posterUrl ?? media.backdropUrl}
                    alt={media.title}
                    class="absolute inset-0 h-full w-full object-cover opacity-30 lg:opacity-20"
                >
            </picture>
        {/if}
        <div class="absolute inset-0 bg-linear-to-b from-background/30 via-background/80 to-background"></div>

        <div class="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <div class="grid gap-8 lg:grid-cols-[320px_1fr] lg:items-end">
                <div class="hidden overflow-hidden rounded-2xl border border-white/10 shadow-2xl lg:block">
                    {#if media.posterUrl}
                        <img src={media.posterUrl} alt={media.title} class="w-full object-cover">
                    {:else}
                        <div class="flex aspect-2/3 items-center justify-center bg-accent text-muted-foreground">
                            <Film class="h-10 w-10" />
                        </div>
                    {/if}
                </div>

                <div class="space-y-6">
                    <div class="space-y-4">
                        <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {#if media.certification}
                                <span class="rounded-full border border-white/15 px-3 py-1">{media.certification}</span>
                            {/if}
                            {#if media.year}
                                <span class="rounded-full border border-white/15 px-3 py-1">{media.year}</span>
                            {/if}
                            <span class="rounded-full border border-white/15 px-3 py-1"
                                >{formatRuntime(media.runtime)}</span
                            >
                            {#if media.originalLanguage}
                                <span class="rounded-full border border-white/15 px-3 py-1 uppercase"
                                    >{media.originalLanguage}</span
                                >
                            {/if}
                        </div>
                        <h1 class="text-4xl font-semibold tracking-tight sm:text-5xl">{media.title}</h1>
                        <p class="max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base">{media.overview}</p>
                        <div class="flex flex-wrap gap-2">
                            {#each media.genres as genre}
                                <span class="rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-300">{genre}</span>
                            {/each}
                        </div>
                    </div>

                    <div class="flex flex-wrap gap-3">
                        <a href={`/watch/${media.id}`}
                            ><Button size="lg">
                                <Play class="mr-2 h-4 w-4 fill-current" />
                                Play
                            </Button></a
                        >
                        {#if inLibrary}
                            <Button variant="destructive" size="lg" onclick={handleDelete}>
                                <Trash2 class="mr-2 h-4 w-4" />
                                Delete
                            </Button>
                        {:else}
                            <Button variant="secondary" size="lg" onclick={handleAdd}>
                                <Plus class="mr-2 h-4 w-4" />
                                Add to Library
                            </Button>
                        {/if}
                    </div>

                    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <div class="rounded-2xl border border-white/10 bg-card/70 p-4">
                            <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Status</p>
                            <p class="mt-2 text-lg font-medium capitalize">{media.status ?? 'complete'}</p>
                        </div>
                        <div class="rounded-2xl border border-white/10 bg-card/70 p-4">
                            <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">File Size</p>
                            <p class="mt-2 text-lg font-medium">{formatBytes(media.fileSize)}</p>
                        </div>
                        <div class="rounded-2xl border border-white/10 bg-card/70 p-4">
                            <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Added</p>
                            <p class="mt-2 text-lg font-medium">{formatDate(media.addedAt)}</p>
                        </div>
                        <div class="rounded-2xl border border-white/10 bg-card/70 p-4">
                            <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Source</p>
                            <p class="mt-2 text-lg font-medium">Browse Catalog</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
{:else}
    <div class="mx-auto max-w-4xl px-6 py-20 text-center">
        <h1 class="text-3xl font-semibold">Movie not found</h1>
        <p class="mt-2 text-sm text-muted-foreground">This title is not part of the catalog.</p>
    </div>
{/if}
