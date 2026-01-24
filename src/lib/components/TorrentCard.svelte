<script lang="ts">
    import { Loader2, LoaderCircle, Play, Plus } from '@lucide/svelte';
    import type { BrowseItem } from '$lib/server/tmdb';
    import { cn } from '$lib/utils';
    import Button from './ui/Button.svelte';
    import Tv from './ui/Tv.svelte';

    let {
        item,
        onAddToLibrary,
        onWatchNow,
        onPrefetch,
        isAdding = false,
        isResolving = false,
        class: className,
    }: {
        item: BrowseItem;
        onAddToLibrary?: (item: BrowseItem) => void;
        onWatchNow?: (item: BrowseItem) => void;
        onPrefetch?: (item: BrowseItem) => void;
        isAdding?: boolean;
        isResolving?: boolean;
        class?: string;
    } = $props();

    let isMobileActive = $state(false);
    let hasPrefetched = $state(false);
    let prefetchTimeout: ReturnType<typeof setTimeout> | null = null;

    const PREFETCH_DELAY = 500; // ms to wait before prefetching

    function handleClick(e: Event) {
        // Don't toggle if we clicked an interactive element inside
        if ((e.target as HTMLElement).closest('button, a')) {
            return;
        }
        isMobileActive = !isMobileActive;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            isMobileActive = !isMobileActive;
        }
    }

    function handleMouseEnter() {
        // Only prefetch once per card and if item needs resolving
        if (!hasPrefetched && item.needsResolve && !item.magnetLink) {
            // Clear any existing timeout
            if (prefetchTimeout) {
                clearTimeout(prefetchTimeout);
            }
            // Start prefetch after delay
            prefetchTimeout = setTimeout(() => {
                hasPrefetched = true;
                onPrefetch?.(item);
                prefetchTimeout = null;
            }, PREFETCH_DELAY);
        }
    }

    function handleMouseLeave() {
        // Cancel prefetch if user leaves before delay completes
        if (prefetchTimeout) {
            clearTimeout(prefetchTimeout);
            prefetchTimeout = null;
        }
    }

    function handleAddToLibrary(e: Event) {
        e.stopPropagation();
        onAddToLibrary?.(item);
    }

    function handleWatchNow(e: Event) {
        e.stopPropagation();
        onWatchNow?.(item);
    }

    const isDisabled = $derived(isAdding);
</script>

<div
    onclick={handleClick}
    onkeydown={handleKeydown}
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
    onfocus={handleMouseEnter}
    onblur={handleMouseLeave}
    role="button"
    tabindex="0"
    class={cn(
        "relative aspect-2/3 rounded-lg group shadow-lg border border-border/50 bg-card hover:scale-[1.02] hover:z-20 hover:border-primary/50 transition-all duration-300 outline-none cursor-pointer",
        className,
    )}
>
    <!-- Image Container -->
    <div class="absolute inset-0 rounded-lg overflow-hidden">
        <!-- Rating Badge -->
        {#if item.voteAverage && item.voteAverage > 0}
            <div
                class="absolute top-2 right-2 z-10 bg-black/80 text-yellow-400 px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 group-hover:hidden {isMobileActive
                    ? 'hidden'
                    : ''}"
            >
                <span class="text-yellow-400">&#9733;</span>
                {item.voteAverage.toFixed(1)}
            </div>
        {/if}

        <!-- Type Badge for TV Shows -->
        {#if item.mediaType === "tv"}
            <div
                class="absolute top-2 left-2 z-10 bg-primary/90 text-primary-foreground px-2 py-0.5 rounded text-xs flex items-center gap-1 group-hover:hidden {isMobileActive
                    ? 'hidden'
                    : ''}"
            >
                <Tv size={12} />
                TV
            </div>
        {/if}

        <!-- Poster Image -->
        {#if item.posterUrl}
            <img
                src={item.posterUrl}
                alt={item.title}
                class="w-full h-full object-cover transition-all duration-300 group-hover:scale-105 group-hover:blur-sm"
                loading="lazy"
            >
        {:else}
            <div class="w-full h-full flex items-center justify-center bg-accent text-muted-foreground">
                <span class="text-sm text-center px-4">{item.title}</span>
            </div>
        {/if}
    </div>

    <!-- Details Overlay -->
    <div
        class={cn(
            "absolute inset-0 p-4 rounded-lg flex flex-col justify-between transition-all duration-300 ease-out bg-black/60 backdrop-blur-sm",
            isMobileActive
                ? "opacity-100 translate-y-0 pointer-events-auto"
                : "opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto",
        )}
    >
        <div class="space-y-2 overflow-hidden flex-1 min-h-0 flex flex-col">
            <h4 class="font-bold text-lg leading-tight text-white shrink-0">{item.title}</h4>

            <div class="flex items-center gap-2 text-xs text-zinc-300 shrink-0">
                {#if item.year}
                    <span>{item.year}</span>
                {/if}
                {#if item.certification}
                    <span class="bg-white/10 px-1 rounded text-[10px] font-medium">{item.certification}</span>
                {/if}
                {#if item.voteAverage && item.voteAverage > 0}
                    <span class="flex items-center gap-0.5 text-yellow-400">
                        &#9733; {item.voteAverage.toFixed(1)}
                    </span>
                {/if}
            </div>

            {#if item.genres.length > 0}
                <div class="flex flex-wrap gap-1 pt-1 shrink-0">
                    {#each item.genres.slice(0, 2) as genre}
                        <span class="px-1.5 py-0.5 bg-zinc-700/80 text-zinc-300 text-[10px] rounded"> {genre} </span>
                    {/each}
                </div>
            {/if}

            {#if item.overview}
                <p class="text-xs text-zinc-400 leading-relaxed overflow-y-auto pr-1">{item.overview}</p>
            {/if}
        </div>

        <div class="flex gap-2 pt-2 shrink-0">
            <Button
                size="sm"
                variant="secondary"
                class="flex-1 text-xs"
                onclick={handleAddToLibrary}
                disabled={isDisabled}
                title="Add to Library"
            >
                {#if isAdding}
                    <LoaderCircle class="w-3 h-3 mr-1 animate-spin" />
                    Adding...
                {:else}
                    <Plus class="w-3 h-3 mr-1" />
                    Add
                {/if}
            </Button>
            <Button size="sm" class="flex-1 text-xs" onclick={handleWatchNow} disabled={isDisabled} title="Watch Now">
                {#if isAdding}
                    <LoaderCircle class="w-3 h-3 mr-1 animate-spin" />
                {:else}
                    <Play class="w-3 h-3 mr-1 fill-current" />
                {/if}
                Watch
            </Button>
        </div>
    </div>
</div>
