<script lang="ts">
    import { ChevronDown, Play, Plus } from '@lucide/svelte';
    import { goto } from '$app/navigation';
    import type { BrowseItem, DemoSeasonSummary } from '$lib/types';
    import { cn } from '$lib/utils';
    import Button from './ui/Button.svelte';
    import ContextMenu from './ui/ContextMenu.svelte';
    import Tv from './ui/Tv.svelte';

    let {
        item,
        onAddToLibrary,
        onWatchNow,
        onSelectSeason,
        isAdding = false,
        seasons = [],
        seasonsLoading = false,
        eagerLoad = false,
        class: className,
    }: {
        item: BrowseItem;
        onAddToLibrary?: (item: BrowseItem) => void;
        onWatchNow?: (item: BrowseItem) => void;
        onSelectSeason?: (item: BrowseItem, seasonNumber: number) => void;
        isAdding?: boolean;
        seasons?: DemoSeasonSummary[];
        seasonsLoading?: boolean;
        eagerLoad?: boolean;
        class?: string;
    } = $props();

    const isTvShow = $derived(item.mediaType === 'show');
    const detailsLink = $derived(item.mediaType === 'show' ? `/show/${item.id}` : `/movie/${item.id}`);

    let seasonMenuOpen = $state(false);
    let progressState = $state<'idle' | 'adding' | 'completing'>('idle');
    let progressWidth = $state(0);
    let transitionDuration = $state(0);

    function handleAddToLibrary(e: Event) {
        e.stopPropagation();
        onAddToLibrary?.(item);
    }

    function handleWatchNow(e: Event) {
        e.stopPropagation();
        onWatchNow?.(item);
    }

    function openDetails() {
        goto(detailsLink);
    }

    function handleCardKeydown(e: KeyboardEvent) {
        if (e.key !== 'Enter' && e.key !== ' ') {
            return;
        }

        e.preventDefault();
        openDetails();
    }

    $effect(() => {
        if (isAdding) {
            if (progressState === 'idle') {
                progressState = 'adding';
                progressWidth = 0;
                transitionDuration = 0;
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        progressWidth = 90;
                        transitionDuration = 15_000;
                    });
                });
            }
        } else if (progressState === 'adding') {
            progressState = 'completing';
            progressWidth = 100;
            transitionDuration = 200;

            setTimeout(() => {
                progressState = 'idle';
                progressWidth = 0;
                transitionDuration = 0;
            }, 500);
        }
    });
</script>

<div
    class={cn('group relative aspect-2/3 cursor-pointer rounded-lg border border-border/50 bg-card shadow-lg outline-none transition-all duration-300 hover:z-20 hover:scale-[1.02] hover:border-primary/50', className)}
    role="link"
    tabindex="0"
    aria-label={`Open details for ${item.title}`}
    onclick={openDetails}
    onkeydown={handleCardKeydown}
>
    <div class="absolute inset-0 overflow-hidden rounded-lg">
        {#if item.voteAverage && item.voteAverage > 0}
            <div
                class="absolute top-2 right-2 z-10 flex items-center gap-1 rounded bg-black/80 px-2 py-0.5 text-xs font-medium text-yellow-400 group-hover:hidden group-focus-within:hidden"
            >
                <span>&#9733;</span>
                {item.voteAverage.toFixed(1)}
            </div>
        {/if}

        {#if item.mediaType === 'show'}
            <div
                class="absolute top-2 left-2 z-10 flex items-center gap-1 rounded bg-primary/90 px-2 py-0.5 text-xs text-primary-foreground group-hover:hidden group-focus-within:hidden"
            >
                <Tv size={12} />
                TV
            </div>
        {/if}

        {#if item.posterUrl}
            <img
                src={item.posterUrl}
                alt={item.title}
                class="h-full w-full object-cover transition-all duration-300 group-hover:scale-105 group-hover:blur-sm"
                loading={eagerLoad ? 'eager' : 'lazy'}
                decoding={eagerLoad ? 'sync' : 'async'}
            >
        {:else}
            <div
                class="flex h-full w-full items-center justify-center bg-accent px-4 text-center text-sm text-muted-foreground"
            >
                {item.title}
            </div>
        {/if}

        {#if progressState !== 'idle'}
            <div
                class="absolute bottom-0 left-0 z-20 h-1 bg-red-600 transition-all ease-out"
                style:width="{progressWidth}%"
                style:transition-duration="{transitionDuration}ms"
            ></div>
        {/if}
    </div>

    <div
        class="pointer-events-none absolute inset-0 flex translate-y-2 flex-col justify-between rounded-lg bg-black/60 p-4 opacity-0 backdrop-blur-sm transition-all duration-300 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100"
    >
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden space-y-2">
            <h4 class="shrink-0 text-lg leading-tight font-bold text-white">{item.title}</h4>
            <div class="flex shrink-0 items-center gap-2 text-xs text-zinc-300">
                {#if item.year}
                    <span>{item.year}</span>
                {/if}
                {#if item.certification}
                    <span class="rounded bg-white/10 px-1 text-[10px] font-medium">{item.certification}</span>
                {/if}
                {#if item.voteAverage && item.voteAverage > 0}
                    <span class="text-yellow-400">&#9733; {item.voteAverage.toFixed(1)}</span>
                {/if}
            </div>
            {#if item.genres.length > 0}
                <div class="flex shrink-0 flex-wrap gap-1 pt-1">
                    {#each item.genres.slice(0, 2) as genre}
                        <span class="rounded bg-zinc-700/80 px-1.5 py-0.5 text-[10px] text-zinc-300">{genre}</span>
                    {/each}
                </div>
            {/if}
            {#if item.overview}
                <p class="overflow-y-auto pr-1 text-xs leading-relaxed text-zinc-400">{item.overview}</p>
            {/if}
        </div>

        <div class="relative flex shrink-0 gap-2 pt-2">
            {#if isTvShow}
                <Button
                    size="sm"
                    class="flex-1 text-xs"
                    onclick={(e) => { e.stopPropagation(); seasonMenuOpen = !seasonMenuOpen; }}
                    disabled={isAdding}
                    title="Add Season"
                >
                    <Plus class="mr-1 h-3 w-3" />
                    Add Season
                    <ChevronDown class={cn('ml-1 h-3 w-3 transition-transform', seasonMenuOpen && 'rotate-180')} />
                </Button>
                <ContextMenu
                    open={seasonMenuOpen}
                    seasons={seasons}
                    loading={seasonsLoading}
                    onSelectSeason={(seasonNumber) => onSelectSeason?.(item, seasonNumber)}
                    onClose={() => (seasonMenuOpen = false)}
                    class="top-full left-0 mt-2"
                />
            {:else}
                <Button
                    size="sm"
                    variant="secondary"
                    class="flex-1 text-xs"
                    onclick={handleAddToLibrary}
                    disabled={isAdding}
                    title="Add to Library"
                >
                    <Plus class="mr-1 h-3 w-3" />
                    Add
                </Button>
                <Button size="sm" class="flex-1 text-xs" onclick={handleWatchNow} disabled={isAdding} title="Watch Now">
                    <Play class="mr-1 h-3 w-3 fill-current" />
                    Watch
                </Button>
            {/if}
        </div>
    </div>
</div>
