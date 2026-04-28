<script lang="ts">
    import { EllipsisVertical, Info, Play, Trash2 } from '@lucide/svelte';
    import { goto } from '$app/navigation';
    import EpisodeSelector from '$lib/components/EpisodeSelector.svelte';
    import type { Media, SeasonWithEpisodes } from '$lib/types';
    import Button from './ui/Button.svelte';
    import Tv from './ui/Tv.svelte';

    let {
        media,
        seasons = [],
        onDelete,
    }: {
        media: Media;
        seasons?: SeasonWithEpisodes[];
        onDelete: (id: string, e: Event) => void;
    } = $props();

    let showMenu = $state(false);

    function handleMenuClick(e: Event) {
        e.preventDefault();
        e.stopPropagation();
        showMenu = !showMenu;
    }

    function handleDelete(e: Event) {
        showMenu = false;
        onDelete(media.id, e);
    }

    function handlePlayEpisode(episode: Media) {
        goto(`/watch/${episode.id}`);
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

    function handleClickOutside(e: MouseEvent) {
        const target = e.target as HTMLElement;
        if (showMenu && !target.closest('.media-menu')) {
            showMenu = false;
        }
    }

    function formatRuntime(minutes: number | null) {
        if (!minutes) {
            return '';
        }
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h}h ${m}m`;
    }

    const detailsLink = $derived(media.type === 'show' ? `/show/${media.id}` : `/movie/${media.id}`);
    const playLink = $derived(media.type === 'show' ? `/show/${media.id}` : `/watch/${media.id}`);
</script>

<svelte:document onclick={handleClickOutside} />

<div
    class="group relative aspect-2/3 cursor-pointer rounded-lg border border-border/50 bg-card shadow-lg outline-none transition-all duration-500 hover:z-20 hover:scale-[1.02] hover:border-red-500"
    role="link"
    tabindex="0"
    aria-label={`Open details for ${media.title}`}
    onclick={openDetails}
    onkeydown={handleCardKeydown}
>
    <div class="absolute inset-0 overflow-hidden rounded-lg">
        {#if media.type === 'show'}
            <div
                class="absolute top-2 left-2 z-10 flex items-center gap-1 rounded bg-primary/90 px-2 py-0.5 text-xs text-primary-foreground group-hover:hidden group-focus-within:hidden"
            >
                <Tv size={12} />
                TV
            </div>
        {/if}

        {#if media.posterUrl}
            <img
                src={media.posterUrl}
                alt={media.title}
                class="h-full w-full object-cover transition-opacity duration-500 group-hover:blur-md"
            >
        {:else}
            <div class="flex h-full w-full items-center justify-center bg-accent text-muted-foreground">
                <span class="text-xs">No Poster</span>
            </div>
        {/if}
    </div>

    <div
        class="pointer-events-none absolute inset-0 z-10 flex translate-y-2 flex-col justify-between rounded-lg bg-black/60 p-4 opacity-0 backdrop-blur-sm transition-all duration-300 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100"
    >
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden space-y-2">
            <h4 class="shrink-0 text-lg leading-tight font-bold text-white">{media.title}</h4>
            <div class="flex shrink-0 items-center gap-2 text-xs text-zinc-300">
                <span>{media.year || ''}</span>
                {#if media.certification}
                    <span class="rounded border border-zinc-600 px-1 text-[10px]">{media.certification}</span>
                {/if}
                {#if media.runtime}
                    <span>• {formatRuntime(media.runtime)}</span>
                {/if}
                {#if media.type === 'show' && media.totalSeasons}
                    <span>• {media.totalSeasons} season(s)</span>
                {/if}
            </div>
            {#if media.overview}
                <p class="overflow-y-auto pr-1 text-xs leading-relaxed text-zinc-400">{media.overview}</p>
            {/if}
        </div>

        <div class="flex shrink-0 items-center gap-2 pt-2">
            {#if media.type === 'show'}
                <EpisodeSelector
                    {seasons}
                    onPlayEpisode={handlePlayEpisode}
                    buttonSize="sm"
                    class="w-full flex-1"
                    buttonClass="w-full"
                />
            {:else}
                <a href={playLink} class="flex-1">
                    <Button size="sm" class="w-full">
                        <Play class="mr-2 h-4 w-4 fill-current" />
                        Play
                    </Button>
                </a>
            {/if}

            <div class="media-menu relative">
                <Button
                    variant="ghost"
                    size="icon"
                    class="size-9.25 shrink-0 text-white hover:bg-neutral-800"
                    aria-label="Open options"
                    onclick={handleMenuClick}
                    title="Options"
                >
                    <EllipsisVertical class="h-5 w-5" />
                </Button>

                {#if showMenu}
                    <div
                        class="absolute right-0 bottom-full z-50 mb-2 w-36 overflow-hidden rounded-md border border-white/10 bg-black/95 shadow-lg ring-1 ring-black/5 backdrop-blur-md"
                    >
                        <div class="py-1" role="menu">
                            <a
                                href={detailsLink}
                                class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10"
                                role="menuitem"
                                onclick={() => (showMenu = false)}
                            >
                                <Info class="h-4 w-4" />
                                Details
                            </a>
                            <button
                                onclick={handleDelete}
                                class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-400 hover:bg-white/10"
                                role="menuitem"
                            >
                                <Trash2 class="h-4 w-4" />
                                Delete
                            </button>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>
