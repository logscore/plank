<script lang="ts">
    import { Ellipsis, EllipsisVertical, Info, MoreVertical, Play, RotateCcw, Trash2 } from '@lucide/svelte';
    import { goto } from '$app/navigation';
    import EpisodeSelector from '$lib/components/EpisodeSelector.svelte';
    import type { Media, SeasonWithEpisodes } from '$lib/types';
    import Button from './ui/Button.svelte';
    import Tv from './ui/Tv.svelte';

    let { media, onDelete } = $props<{
        media: Media;
        onDelete: (id: string, e: Event) => void;
    }>();

    let showMenu = $state(false);
    let retrying = $state(false);
    let isMobileActive = $state(false);
    let rootEl: HTMLElement | undefined = $state();
    let seasons = $state<SeasonWithEpisodes[]>([]);

    async function loadEpisodes() {
        if (seasons.length > 0) {
            return;
        }
        try {
            const res = await fetch(`/api/media/${media.id}/seasons`);
            if (res.ok) {
                seasons = await res.json();
            }
        } catch (err) {
            console.error('Failed to load episodes:', err);
        }
    }

    // Define a minimal Episode type compatible with both source and target requirements
    interface CompatibleEpisode {
        id: string;
        episodeNumber: number;
        title: string | null;
        overview: string | null;
        stillPath: string | null;
        runtime: number | null;
        airDate: string | null;
        fileIndex: number | null;
        filePath: string | null;
    }

    function handlePlayEpisode(episodeId: string, episode: CompatibleEpisode) {
        if (episode.fileIndex !== null) {
            goto(`/watch/${media.id}?episodeId=${episodeId}&fileIndex=${episode.fileIndex}`);
        }
    }

    function handleMenuClick(e: Event) {
        e.preventDefault();
        e.stopPropagation();
        showMenu = !showMenu;
    }

    function handleDelete(e: Event) {
        showMenu = false;
        onDelete(media.id, e);
    }

    async function handleRetry(e: Event) {
        e.preventDefault();
        e.stopPropagation();
        retrying = true;
        try {
            const res = await fetch(`/api/media/${media.id}/retry`, {
                method: 'POST',
            });
            if (res.ok) {
                // Status will update via polling/SSE; for now reload
                window.location.reload();
            }
        } catch (err) {
            console.error('Failed to retry download:', err);
        } finally {
            retrying = false;
        }
    }

    function handleClickOutside(e: MouseEvent) {
        const target = e.target as HTMLElement;
        if (showMenu && !target.closest('.media-menu')) {
            showMenu = false;
        }
        // Close mobile overlay if clicked outside
        if (isMobileActive && rootEl && !rootEl.contains(target)) {
            isMobileActive = false;
        }
    }

    function toggleMobileActive(e: Event) {
        // Don't toggle if we clicked an interactive element inside
        if ((e.target as HTMLElement).closest('button, a')) {
            return;
        }
        isMobileActive = !isMobileActive;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleMobileActive(e);
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

    // Determine the link based on media type
    const detailsLink = $derived(media.type === 'tv' ? `/show/${media.id}` : `/movie/${media.id}`);
    const playLink = $derived(media.type === 'tv' ? `/show/${media.id}` : `/watch/${media.id}`);
</script>

<svelte:document onclick={handleClickOutside} />

<div
    bind:this={rootEl}
    onclick={toggleMobileActive}
    onkeydown={handleKeydown}
    role="button"
    tabindex="0"
    class="relative aspect-2/3 rounded-lg group shadow-lg border border-border/50 bg-card hover:scale-[1.02] hover:z-20 hover:border-red-500 transition-all duration-500 outline-none"
>
    <!-- Image Container (Clipped) -->
    <div class="absolute inset-0 rounded-lg overflow-hidden">
        <!-- Type Badge for TV Shows -->
        {#if media.type === "tv"}
            <div
                class="absolute top-2 left-2 z-10 bg-primary/90 text-primary-foreground px-2 py-0.5 rounded text-xs flex items-center gap-1 group-hover:hidden group-active:hidden {isMobileActive
                    ? 'hidden'
                    : ''}"
            >
                <Tv size={12} />
                TV
            </div>
        {/if}

        <!-- Poster Image -->
        {#if media.posterUrl}
            <img
                src={media.posterUrl}
                alt={media.title}
                class="w-full h-full object-cover transition-opacity duration-500 group-hover:blur-md"
            >
        {:else}
            <div class="w-full h-full flex items-center justify-center bg-accent text-muted-foreground">
                <span class="text-xs">No Poster</span>
            </div>
        {/if}
    </div>

    <!-- Details Overlay (Visible on Hover or Mobile Active) -->
    <div
        class="absolute inset-0 p-4 rounded-lg flex flex-col justify-between transition-all duration-300 ease-out bg-black/60 backdrop-blur-sm
        {isMobileActive
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto'}"
    >
        <div class="space-y-2 overflow-hidden flex-1 min-h-0 flex flex-col">
            <h4 class="font-bold text-lg leading-tight text-white shrink-0">{media.title}</h4>
            <div class="flex items-center gap-2 text-xs text-zinc-300 shrink-0">
                <span>{media.year || ""}</span>
                {#if media.certification}
                    <span class="px-1 border border-zinc-600 rounded text-[10px]">{media.certification}</span>
                {/if}
                {#if media.runtime}
                    <span>• {formatRuntime(media.runtime)}</span>
                {/if}
                {#if media.type === "tv" && media.totalSeasons}
                    <span
                        >• {media.totalSeasons} season
                        {media.totalSeasons === 1
                            ? ""
                            : "s"}</span
                    >
                {/if}
            </div>
            {#if media.overview}
                <p class="text-xs text-zinc-400 leading-relaxed overflow-y-auto pr-1">{media.overview}</p>
            {/if}
        </div>

        <div class="flex items-center gap-2 pt-2 shrink-0">
            {#if media.status === "error"}
                <button
                    onclick={handleRetry}
                    disabled={retrying}
                    class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-yellow-600 hover:bg-yellow-500 text-white font-medium text-sm transition disabled:opacity-50"
                >
                    <RotateCcw class="w-4 h-4" />
                    {retrying ? "Retrying..." : "Download"}
                </button>
            {:else if media.type === "tv"}
                <EpisodeSelector
                    {seasons}
                    onPlayEpisode={handlePlayEpisode}
                    onOpen={loadEpisodes}
                    buttonSize="sm"
                    class="flex-1 w-full"
                    buttonClass="w-full"
                />
            {:else}
                <a href={playLink} class="flex-1">
                    <Button size="sm" class="w-full">
                        <Play class="w-4 h-4 mr-2 fill-current" />
                        Play
                    </Button>
                </a>
            {/if}

            <!-- Three-dot Menu -->
            <div class="relative media-menu">
                <Button
                    variant="ghost"
                    size="icon"
                    class="text-white hover:bg-neutral-800 shrink-0 size-9.25"
                    onclick={handleMenuClick}
                    title="Options"
                >
                    <EllipsisVertical class="w-5 h-5" />
                </Button>

                <!-- Context Menu Dropdown -->
                {#if showMenu}
                    <div
                        class="absolute right-0 bottom-full mb-2 w-36 rounded-md shadow-lg bg-black/95 border border-white/10 ring-1 ring-black ring-opacity-5 backdrop-blur-md overflow-hidden z-50"
                    >
                        <div class="py-1" role="menu">
                            <a
                                href={detailsLink}
                                class="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10 flex items-center gap-2"
                                role="menuitem"
                                onclick={() => (showMenu = false)}
                            >
                                <Info class="w-4 h-4" />
                                Details
                            </a>
                            <button
                                onclick={handleDelete}
                                class="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-white/10 flex items-center gap-2"
                                role="menuitem"
                            >
                                <Trash2 class="w-4 h-4" />
                                Delete
                            </button>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>
