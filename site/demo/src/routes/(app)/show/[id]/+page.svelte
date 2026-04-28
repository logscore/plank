<script lang="ts">
    import { Github, Play, Plus, Trash2 } from '@lucide/svelte';
    import { toast } from 'svelte-sonner';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import Button from '$lib/components/ui/Button.svelte';
    import { demoStore } from '$lib/demo/store.svelte';
    import { formatDate, formatRuntime } from '$lib/demo/utils';
    import type { SeasonWithEpisodes } from '$lib/types';
    import { confirmDelete } from '$lib/ui-state.svelte';

    const mediaId = $derived(page.params.id ?? '');
    const media = $derived(demoStore.findMedia(mediaId));
    const seasons = $derived<SeasonWithEpisodes[]>(media?.type === 'show' ? demoStore.getShowSeasons(media.id) : []);
    const inLibrary = $derived(Boolean(media && demoStore.hasInLibrary(media.id)));
    let activeSeason = $state(1);

    $effect(() => {
        if (seasons.length > 0 && !seasons.some((season: SeasonWithEpisodes) => season.seasonNumber === activeSeason)) {
            activeSeason = seasons[0].seasonNumber;
        }
    });

    const selectedSeason = $derived(
        seasons.find((season: SeasonWithEpisodes) => season.seasonNumber === activeSeason) ?? seasons[0]
    );

    function addSeason(seasonNumber: number) {
        if (!(media && media.type === 'show')) {
            return;
        }
        demoStore.addFromBrowse(
            {
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
                mediaType: 'show',
                certification: media.certification,
                needsResolve: false,
                runtime: media.runtime,
                originalLanguage: media.originalLanguage,
                totalSeasons: media.totalSeasons,
                availableSeasons: seasons.map((season: SeasonWithEpisodes) => ({
                    seasonNumber: season.seasonNumber,
                    name: season.name ?? `Season ${season.seasonNumber}`,
                    episodeCount: season.episodeCount ?? season.episodes.length,
                    year: media.year ?? undefined,
                    posterPath: season.posterPath ?? undefined,
                    airDate: season.airDate,
                    overview: season.overview,
                })),
            },
            seasonNumber
        );
        toast.success(`${media.title} Season ${seasonNumber} added to the library`);
    }

    function deleteShow() {
        if (!media) {
            return;
        }
        confirmDelete('Remove show', `Delete ${media.title} from the library?`, () => {
            demoStore.removeMedia(media.id);
            goto('/?type=shows');
        });
    }
</script>

{#if media?.type === 'show'}
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
            <div class="grid gap-8 lg:grid-cols-[280px_1fr] lg:items-end">
                <div class="hidden overflow-hidden rounded-2xl border border-white/10 shadow-2xl lg:block">
                    {#if media.posterUrl}
                        <img src={media.posterUrl} alt={media.title} class="w-full object-cover">
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
                            <span class="rounded-full border border-white/15 px-3 py-1"
                                >{media.totalSeasons} seasons</span
                            >
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
                        {#if selectedSeason?.episodes[0]}
                            <a href={`/watch/${selectedSeason.episodes[0].id}`}
                                ><Button size="lg">
                                    <Play class="mr-2 h-4 w-4 fill-current" />
                                    Play
                                </Button></a
                            >
                        {/if}
                        {#if inLibrary}
                            <Button variant="destructive" size="lg" onclick={deleteShow}>
                                <Trash2 class="mr-2 h-4 w-4" />
                                Delete
                            </Button>
                        {:else}
                            <Button variant="secondary" size="lg" onclick={() => addSeason(activeSeason)}>
                                <Plus class="mr-2 h-4 w-4" />
                                Add Show
                            </Button>
                        {/if}
                    </div>

                    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <div class="rounded-2xl border border-white/10 bg-card/70 p-4">
                            <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Status</p>
                            <p class="mt-2 text-lg font-medium capitalize">{media.status ?? 'complete'}</p>
                        </div>
                        <div class="rounded-2xl border border-white/10 bg-card/70 p-4">
                            <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Episodes</p>
                            <p class="mt-2 text-lg font-medium">{selectedSeason?.episodes.length ?? 0}</p>
                        </div>
                        <div class="rounded-2xl border border-white/10 bg-card/70 p-4">
                            <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Added</p>
                            <p class="mt-2 text-lg font-medium">{formatDate(media.addedAt)}</p>
                        </div>
                        <div class="rounded-2xl border border-white/10 bg-card/70 p-4">
                            <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Language</p>
                            <p class="mt-2 text-lg font-medium uppercase">{media.originalLanguage ?? 'en'}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="mt-10 space-y-6">
                <div class="flex flex-wrap gap-2">
                    {#each seasons as season}
                        <button
                            class="rounded-full border px-4 py-2 text-sm transition {activeSeason === season.seasonNumber ? 'border-white bg-white/10 text-white' : 'border-white/10 text-muted-foreground hover:border-white/30 hover:text-white'}"
                            onclick={() => (activeSeason = season.seasonNumber)}
                        >
                            Season {season.seasonNumber}
                        </button>
                    {/each}
                </div>

                {#if selectedSeason}
                    <div class="rounded-2xl border border-white/10 bg-card/60 p-5">
                        <div class="mb-5 flex items-center justify-between gap-4">
                            <div>
                                <h2 class="text-2xl font-semibold">
                                    {selectedSeason.name ?? `Season ${selectedSeason.seasonNumber}`}
                                </h2>
                                <p class="mt-1 text-sm text-muted-foreground">{selectedSeason.overview}</p>
                            </div>
                            {#if !inLibrary}
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onclick={() => addSeason(selectedSeason.seasonNumber)}
                                >
                                    <Plus class="mr-2 h-4 w-4" />
                                    Add
                                </Button>
                            {/if}
                        </div>

                        <div class="space-y-3">
                            {#each selectedSeason.episodes as episode}
                                <div
                                    class="flex flex-col gap-4 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div class="flex items-start gap-4">
                                        <div class="hidden h-16 w-28 overflow-hidden rounded-lg bg-accent sm:block">
                                            {#if episode.stillPath}
                                                <img
                                                    src={episode.stillPath}
                                                    alt={episode.title}
                                                    class="h-full w-full object-cover"
                                                >
                                            {/if}
                                        </div>
                                        <div>
                                            <p class="text-sm font-medium text-white">
                                                Episode {episode.episodeNumber}
                                            </p>
                                            <h3 class="text-lg font-semibold">{episode.title}</h3>
                                            <p class="mt-1 text-sm text-muted-foreground">{episode.overview}</p>
                                        </div>
                                    </div>
                                    <a href={`/watch/${episode.id}`}
                                        ><Button size="sm">
                                            <Play class="mr-2 h-4 w-4 fill-current" />
                                            Play
                                        </Button></a
                                    >
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{:else}
    <div class="mx-auto max-w-4xl px-6 py-20 text-center">
        <h1 class="text-3xl font-semibold">Show not found</h1>
        <p class="mt-2 text-sm text-muted-foreground">This title is not part of the catalog.</p>
    </div>
{/if}
