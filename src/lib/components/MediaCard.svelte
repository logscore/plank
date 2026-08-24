<script lang="ts">
    import { EllipsisVertical, Info, Play, RotateCcw, Trash2 } from "@lucide/svelte";
    import { DropdownMenu } from "bits-ui";
    import { goto } from "$app/navigation";
    import EpisodeSelector from "$lib/components/EpisodeSelector.svelte";
    import { createRetryMediaMutation } from "$lib/data/media";
    import type { Media, SeasonWithEpisodes } from "$lib/types";
    import { canPlayEpisode } from "$lib/utils";
    import Button from "./ui/Button.svelte";
    import Tv from "./ui/Tv.svelte";

    let { media, seasons, onDelete } = $props<{
        media: Media;
        seasons: SeasonWithEpisodes[];
        onDelete: (id: string, e: Event) => void;
    }>();

    let isMobileActive = $state(false);
    let optionsOpen = $state(false);
    let rootEl: HTMLElement | undefined = $state();

    const retryMutation = createRetryMediaMutation();
    const retrying = $derived(retryMutation.isPending);

    function handlePlayEpisode(episode: Media) {
        if (canPlayEpisode(episode)) {
            goto(`/watch/${episode.id}`);
        }
    }

    function handleDelete() {
        onDelete(media.id, new Event("select"));
    }

    async function handleRetry(e: Event) {
        e.preventDefault();
        e.stopPropagation();
        try {
            await retryMutation.mutateAsync({ id: media.id });
        } catch (error) {
            console.error("Failed to retry download:", error);
        }
    }

    function handleClickOutside(e: MouseEvent) {
        const target = e.target as HTMLElement;
        // Close mobile overlay if clicked outside
        if (isMobileActive && rootEl && !rootEl.contains(target)) {
            isMobileActive = false;
        }
    }

    function toggleMobileActive(e: Event) {
        // Don't toggle if we clicked an interactive element inside
        if ((e.target as HTMLElement).closest("button, a")) {
            return;
        }
        isMobileActive = !isMobileActive;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleMobileActive(e);
        }
    }

    function formatRuntime(minutes: number | null) {
        if (!minutes) {
            return "";
        }
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h}h ${m}m`;
    }

    // Determine the link based on media type
    const detailsLink = $derived(media.type === "show" ? `/show/${media.id}` : `/movie/${media.id}`);
    const playLink = $derived(media.type === "show" ? `/show/${media.id}` : `/watch/${media.id}`);
</script>

<svelte:document onclick={handleClickOutside} />

<div
    bind:this={rootEl}
    onclick={toggleMobileActive}
    onkeydown={handleKeydown}
    role="button"
    tabindex="0"
    class="group relative aspect-2/3 rounded-lg border border-border/50 bg-card shadow-lg outline-none transition-all duration-500 hover:z-20 hover:scale-[1.02] hover:border-red-500"
>
    <div class="absolute inset-0 overflow-hidden rounded-lg">
        {#if media.type === "show"}
            <div
                class="absolute left-2 top-2 z-10 flex items-center gap-1 rounded bg-primary/90 px-2 py-0.5 text-xs text-primary-foreground group-hover:hidden group-active:hidden {isMobileActive ||
                optionsOpen
                    ? 'hidden'
                    : ''}"
            >
                <Tv size={12} />
                TV
            </div>
        {/if}

        {#if media.posterUrl}
            <img
                src={media.posterUrl}
                alt={media.title}
                class="h-full w-full object-cover transition-opacity duration-500 group-hover:blur-md {isMobileActive ||
                optionsOpen
                    ? 'blur-md'
                    : ''}"
            >
        {:else}
            <div class="flex h-full w-full items-center justify-center bg-accent text-muted-foreground">
                <span class="text-xs">No Poster</span>
            </div>
        {/if}
    </div>

    <div
        class="absolute inset-0 flex flex-col justify-between rounded-lg bg-black/60 p-4 backdrop-blur-sm transition-all duration-300 ease-out
        {isMobileActive || optionsOpen
            ? 'pointer-events-auto translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-2 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100'}"
    >
        <div class="flex min-h-0 flex-1 flex-col space-y-2 overflow-hidden">
            <h4 class="shrink-0 text-lg font-bold leading-tight text-white">{media.title}</h4>
            <div class="flex shrink-0 items-center gap-2 text-xs text-zinc-300">
                <span>{media.year || ""}</span>
                {#if media.certification}
                    <span class="rounded border border-zinc-600 px-1 text-[10px]">{media.certification}</span>
                {/if}
                {#if media.runtime}
                    <span>• {formatRuntime(media.runtime)}</span>
                {/if}
                {#if media.type === "show" && media.totalSeasons}
                    <span>• {media.totalSeasons} season(s)</span>
                {/if}
            </div>
            {#if media.overview}
                <p class="overflow-y-auto pr-1 text-xs leading-relaxed text-zinc-400">{media.overview}</p>
            {/if}
        </div>

        <div class="flex shrink-0 items-center gap-2 pt-2">
            {#if media.status === "error"}
                <button
                    onclick={handleRetry}
                    disabled={retrying}
                    class="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-yellow-500 disabled:opacity-50"
                >
                    <RotateCcw class="h-4 w-4" />
                    {retrying ? "Retrying..." : "Download"}
                </button>
            {:else if media.type === "show"}
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

            <DropdownMenu.Root bind:open={optionsOpen}>
                <DropdownMenu.Trigger
                    class="inline-flex size-9.25 shrink-0 items-center justify-center rounded-md text-white transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Open options"
                >
                    <EllipsisVertical class="h-5 w-5" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content
                        side="top"
                        align="end"
                        sideOffset={8}
                        class="z-50 w-36 overflow-hidden rounded-xl border border-white/10 bg-black/95 p-1.5 text-gray-200 shadow-2xl backdrop-blur-xl focus:outline-none"
                    >
                        <DropdownMenu.Item
                            onSelect={async () => {
                                await goto(detailsLink);
                            }}
                            class="flex h-9 cursor-default select-none items-center gap-2 rounded-lg px-3 text-sm outline-none data-highlighted:bg-white/10"
                        >
                            <Info class="h-4 w-4" />
                            Details
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                            onSelect={handleDelete}
                            class="flex h-9 cursor-default select-none items-center gap-2 rounded-lg px-3 text-sm text-red-400 outline-none data-highlighted:bg-red-500/10"
                        >
                            <Trash2 class="h-4 w-4" />
                            Delete
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>
        </div>
    </div>
</div>
