<script lang="ts">
    import { ChevronDown, ChevronRight, Play } from '@lucide/svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import type { Episode, SeasonWithEpisodes } from '$lib/types';

    let {
        seasons,
        onPlayEpisode,
        onOpen,
        buttonSize = 'lg',
        buttonClass = '',
        class: className = '',
    }: {
        seasons: SeasonWithEpisodes[];
        onPlayEpisode: (episodeId: string, episode: Episode) => void;
        onOpen?: () => Promise<void>;
        buttonSize?: 'default' | 'sm' | 'lg' | 'icon';
        buttonClass?: string;
        class?: string;
    } = $props();

    let isOpen = $state(false);
    let selectedSeasonIndex = $state<number | null>(null);
    let menuRef = $state<HTMLDivElement | null>(null);
    let loading = $state(false);

    async function toggleMenu() {
        if (isOpen) {
            isOpen = false;
            selectedSeasonIndex = null;
        } else {
            if (onOpen) {
                loading = true;
                try {
                    await onOpen();
                } finally {
                    loading = false;
                }
            }
            isOpen = true;
            selectedSeasonIndex = null;
        }
    }

    function selectSeason(index: number) {
        selectedSeasonIndex = selectedSeasonIndex === index ? null : index;
    }

    function playEpisode(episode: Episode) {
        isOpen = false;
        selectedSeasonIndex = null;
        onPlayEpisode(episode.id, episode);
    }

    function handleClickOutside(event: MouseEvent) {
        if (menuRef && !menuRef.contains(event.target as Node)) {
            isOpen = false;
            selectedSeasonIndex = null;
        }
    }

    function formatRuntime(minutes: number | null): string {
        if (!minutes) {
            return '';
        }
        if (minutes < 60) {
            return `${minutes}m`;
        }
        return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    }

    $effect(() => {
        if (isOpen) {
            document.addEventListener('click', handleClickOutside);
        } else {
            document.removeEventListener('click', handleClickOutside);
        }
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    });
</script>

<div class="relative {className}" bind:this={menuRef}>
    <!-- Main Button -->
    <Button size={buttonSize} class="px-4 {buttonClass}" onclick={toggleMenu} disabled={loading}>
        <span class="flex-1 text-left">Episodes</span>
        <ChevronDown
            class="w-4 h-4 ml-2 transition-transform shrink-0 {isOpen
                ? 'rotate-180'
                : ''}"
        />
    </Button>

    <!-- Dropdown Menu -->
    {#if isOpen}
        <div
            class="absolute top-full left-0 mt-2 w-72 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden"
        >
            <!-- Seasons List -->
            <div class="max-h-96 overflow-y-auto">
                {#each seasons as season, index}
                    <div class="border-b border-border last:border-b-0">
                        <!-- Season Header -->
                        <button
                            class="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors text-left"
                            onclick={() => selectSeason(index)}
                        >
                            <div class="flex-1">
                                <span class="font-medium text-white">
                                    {season.name ||
                                        `Season ${season.seasonNumber}`}
                                </span>
                                {#if season.episodeCount}
                                    <span class="text-xs text-muted-foreground ml-2">
                                        {season.episodeCount} episodes
                                    </span>
                                {/if}
                            </div>
                            <ChevronRight
                                class="w-4 h-4 text-muted-foreground transition-transform {selectedSeasonIndex ===
                                index
                                    ? 'rotate-90'
                                    : ''}"
                            />
                        </button>

                        <!-- Episodes List (Expanded) -->
                        {#if selectedSeasonIndex === index}
                            <div class="bg-background/50 border-t border-border">
                                {#each season.episodes as episode}
                                    <button
                                        class="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                        onclick={() => playEpisode(episode)}
                                        disabled={episode.fileIndex === null}
                                    >
                                        <!-- Episode Number -->
                                        <div
                                            class="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0"
                                        >
                                            <span class="text-xs font-medium">{episode.episodeNumber}</span>
                                        </div>

                                        <!-- Episode Info -->
                                        <div class="flex-1 min-w-0">
                                            <div class="flex items-center gap-2">
                                                <span class="font-medium text-white truncate">
                                                    {episode.title ||
                                                        `Episode ${episode.episodeNumber}`}
                                                </span>
                                                {#if episode.runtime}
                                                    <span class="text-xs text-muted-foreground shrink-0">
                                                        {formatRuntime(
                                                            episode.runtime,
                                                        )}
                                                    </span>
                                                {/if}
                                            </div>
                                            {#if episode.fileIndex === null}
                                                <span class="text-xs text-yellow-500">Not available</span>
                                            {/if}
                                        </div>

                                        <!-- Play Icon -->
                                        <div class="opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Play class="w-4 h-4 text-primary fill-current" />
                                        </div>
                                    </button>
                                {/each}

                                {#if season.episodes.length === 0}
                                    <div class="px-4 py-3 text-sm text-muted-foreground text-center">
                                        No episodes available
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/each}

                {#if seasons.length === 0}
                    <div class="px-4 py-6 text-center text-muted-foreground">No seasons available</div>
                {/if}
            </div>
        </div>
    {/if}
</div>
