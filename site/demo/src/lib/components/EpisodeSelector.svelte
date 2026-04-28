<script lang="ts">
    import { ChevronDown, ChevronRight, Play } from '@lucide/svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import { canPlayEpisode } from '$lib/media-playability';
    import type { Media, SeasonWithEpisodes } from '$lib/types';

    let {
        seasons,
        onPlayEpisode,
        buttonSize = 'lg',
        buttonClass = '',
        class: className = '',
    }: {
        seasons: SeasonWithEpisodes[];
        onPlayEpisode: (episode: Media) => void;
        buttonSize?: 'default' | 'sm' | 'lg' | 'icon';
        buttonClass?: string;
        class?: string;
    } = $props();

    let open = $state(false);
    let expandedSeason = $state<number | null>(null);

    $effect(() => {
        if (expandedSeason === null && seasons[0]) {
            expandedSeason = seasons[0].seasonNumber;
        }
    });

    function toggleSeason(seasonNumber: number) {
        expandedSeason = expandedSeason === seasonNumber ? null : seasonNumber;
    }
</script>

<div class={className}>
    <Button size={buttonSize} class={buttonClass} onclick={() => (open = !open)}>
        Episodes
        <ChevronDown class="ml-2 h-4 w-4" />
    </Button>

    {#if open}
        <div
            class="absolute bottom-full left-0 z-30 mb-2 max-h-96 w-80 overflow-auto rounded-lg border border-border bg-black/95 p-2 shadow-xl backdrop-blur-md"
        >
            {#each seasons as season}
                <div class="overflow-hidden rounded-md border border-transparent hover:border-white/10">
                    <button
                        class="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-white/5"
                        onclick={() => toggleSeason(season.seasonNumber)}
                    >
                        <div>
                            <p class="text-sm font-medium text-white">
                                {season.name ?? `Season ${season.seasonNumber}`}
                            </p>
                            <p class="text-xs text-muted-foreground">
                                {season.episodeCount ?? season.episodes.length} episodes
                            </p>
                        </div>
                        {#if expandedSeason === season.seasonNumber}
                            <ChevronDown class="h-4 w-4 text-muted-foreground" />
                        {:else}
                            <ChevronRight class="h-4 w-4 text-muted-foreground" />
                        {/if}
                    </button>

                    {#if expandedSeason === season.seasonNumber}
                        <div class="space-y-1 px-2 pb-2">
                            {#each season.episodes as episode}
                                <button
                                    class="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-white/5"
                                    onclick={() => canPlayEpisode(episode) && onPlayEpisode(episode)}
                                    disabled={!canPlayEpisode(episode)}
                                >
                                    <div>
                                        <p class="text-sm text-white">Episode {episode.episodeNumber}</p>
                                        <p class="text-xs text-muted-foreground">{episode.title}</p>
                                    </div>
                                    <Play class="h-4 w-4 text-white" />
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>
