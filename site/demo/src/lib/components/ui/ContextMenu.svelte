<script lang="ts">
    import { Download, Loader2 } from '@lucide/svelte';
    import { cn } from '$lib/utils';

    export interface SeasonData {
        seasonNumber: number;
        name: string;
        episodeCount: number;
        year?: number;
        posterPath?: string;
    }

    let {
        open = false,
        seasons = [],
        loading = false,
        onSelectSeason,
        onPrefetchSeason,
        onClose,
        class: className,
    }: {
        open: boolean;
        seasons: SeasonData[];
        loading?: boolean;
        onSelectSeason: (seasonNumber: number) => void;
        onPrefetchSeason?: (seasonNumber: number) => void;
        onClose: () => void;
        class?: string;
    } = $props();

    let menuRef = $state<HTMLDivElement | null>(null);
    let prefetchTimeout: ReturnType<typeof setTimeout> | null = null;
    const PREFETCH_DELAY = 500;

    function handleClickOutside(event: MouseEvent) {
        if (menuRef && !menuRef.contains(event.target as Node)) {
            onClose();
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            onClose();
        }
    }

    function handleSeasonClick(seasonNumber: number) {
        onSelectSeason(seasonNumber);
        onClose();
    }

    function handleMouseEnter(seasonNumber: number) {
        if (onPrefetchSeason) {
            if (prefetchTimeout) {
                clearTimeout(prefetchTimeout);
            }
            prefetchTimeout = setTimeout(() => {
                onPrefetchSeason(seasonNumber);
                prefetchTimeout = null;
            }, PREFETCH_DELAY);
        }
    }

    function handleMouseLeave() {
        if (prefetchTimeout) {
            clearTimeout(prefetchTimeout);
            prefetchTimeout = null;
        }
    }

    $effect(() => {
        if (open) {
            document.addEventListener('click', handleClickOutside);
            document.addEventListener('keydown', handleKeydown);
        } else {
            document.removeEventListener('click', handleClickOutside);
            document.removeEventListener('keydown', handleKeydown);
        }
        return () => {
            document.removeEventListener('click', handleClickOutside);
            document.removeEventListener('keydown', handleKeydown);
        };
    });
</script>

{#if open}
    <div
        bind:this={menuRef}
        class={cn(
			'absolute z-50 w-72 bg-card border border-border rounded-lg shadow-xl overflow-hidden',
			className
		)}
        role="menu"
        tabindex="-1"
    >
        {#if loading}
            <div class="flex items-center justify-center py-6 px-4">
                <Loader2 class="w-5 h-5 animate-spin text-muted-foreground" />
                <span class="ml-2 text-sm text-muted-foreground">Loading seasons...</span>
            </div>
        {:else if seasons.length === 0}
            <div class="py-4 px-4 text-center text-sm text-muted-foreground">No seasons available</div>
        {:else}
            <div class="max-h-96 overflow-y-auto">
                {#each seasons as season}
                    <button
                        class="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left group"
                        onclick={() => handleSeasonClick(season.seasonNumber)}
                        onmouseenter={() => handleMouseEnter(season.seasonNumber)}
                        onmouseleave={handleMouseLeave}
                        role="menuitem"
                    >
                        <div class="flex-1 min-w-0">
                            <span class="font-medium text-white">
                                {season.name || `Season ${season.seasonNumber}`}
                            </span>
                            {#if season.episodeCount > 0}
                                <span class="text-xs text-muted-foreground ml-2"> {season.episodeCount} episodes </span>
                            {/if}
                        </div>

                        <div class="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Download class="w-4 h-4 text-primary" />
                        </div>
                    </button>
                {/each}
            </div>
        {/if}
    </div>
{/if}
