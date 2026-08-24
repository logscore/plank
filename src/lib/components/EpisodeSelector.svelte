<script lang="ts">
    import { ChevronDown, ChevronRight, Play } from "@lucide/svelte";
    import { Accordion, Popover } from "bits-ui";
    import type { Media, SeasonWithEpisodes } from "$lib/types";
    import { canPlayEpisode } from "$lib/utils";

    let {
        seasons,
        onPlayEpisode,
        onOpen,
        buttonSize = "lg",
        buttonClass = "",
        class: className = "",
    }: {
        seasons: SeasonWithEpisodes[];
        onPlayEpisode: (episode: Media) => void;
        onOpen?: () => Promise<void>;
        buttonSize?: "default" | "sm" | "lg" | "icon";
        buttonClass?: string;
        class?: string;
    } = $props();

    let isOpen = $state(false);
    let loading = $state(false);

    const buttonSizes = {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
    };

    async function setOpen(open: boolean) {
        if (!open) {
            isOpen = false;
            return;
        }
        if (loading) {
            return;
        }
        await loadAndOpen();
    }

    async function loadAndOpen() {
        loading = true;
        try {
            await onOpen?.();
            isOpen = true;
        } finally {
            loading = false;
        }
    }

    function playEpisode(episode: Media) {
        isOpen = false;
        onPlayEpisode(episode);
    }

    function getEpisodeStatusLabel(episode: Media): string | null {
        if (episode.status === "searching") {
            return "Searching";
        }
        if (episode.status === "downloading") {
            return "Downloading";
        }
        if (episode.status === "not_found") {
            return "Not found";
        }
        if (episode.status === "error") {
            return "Retry needed";
        }
        if (!canPlayEpisode(episode)) {
            return "Not available";
        }
        return null;
    }

    function formatRuntime(minutes: number | null): string {
        if (!minutes) {
            return "";
        }
        if (minutes < 60) {
            return `${minutes}m`;
        }
        return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    }
</script>

<div class={className}>
    <Popover.Root bind:open={() => isOpen, setOpen}>
        <Popover.Trigger
            disabled={loading}
            class="inline-flex items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 {buttonSizes[
                buttonSize
            ]} {buttonClass}"
        >
            <span class="flex-1 text-left">{loading ? "Loading..." : "Episodes"}</span>
            <ChevronDown class="ml-2 h-4 w-4 shrink-0 transition-transform {isOpen ? 'rotate-180' : ''}" />
        </Popover.Trigger>
        <Popover.Portal>
            <Popover.Content
                side="bottom"
                align="start"
                sideOffset={8}
                class="z-50 max-h-96 w-72 overflow-y-auto rounded-xl border border-white/10 bg-black/95 p-1.5 text-foreground shadow-2xl backdrop-blur-xl focus:outline-none"
            >
                {#if seasons.length === 0}
                    <div class="px-4 py-6 text-center text-sm text-muted-foreground">No seasons available</div>
                {:else}
                    <Accordion.Root type="single">
                        {#each seasons as season (season.id)}
                            <Accordion.Item value={season.id} class="border-b border-white/10 last:border-b-0">
                                <Accordion.Header>
                                    <Accordion.Trigger
                                        class="group flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <span class="min-w-0 flex-1">
                                            <span class="font-medium text-white">
                                                {season.name || `Season ${season.seasonNumber}`}
                                            </span>
                                            {#if season.episodeCount}
                                                <span class="ml-2 text-xs text-muted-foreground">
                                                    {season.episodeCount} episodes
                                                </span>
                                            {/if}
                                        </span>
                                        <ChevronRight
                                            class="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90"
                                        />
                                    </Accordion.Trigger>
                                </Accordion.Header>
                                <Accordion.Content class="overflow-hidden">
                                    <div class="border-t border-white/10 bg-white/3">
                                        {#each season.episodes as episode (episode.id)}
                                            <button
                                                class="group flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                                                onclick={() => playEpisode(episode)}
                                                disabled={!canPlayEpisode(episode)}
                                            >
                                                <span
                                                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium"
                                                >
                                                    {episode.episodeNumber}
                                                </span>
                                                <span class="min-w-0 flex-1">
                                                    <span class="flex items-center gap-2">
                                                        <span class="truncate font-medium text-white">
                                                            {episode.title ||
                                                                `Episode ${episode.episodeNumber}`}
                                                        </span>
                                                        {#if episode.runtime}
                                                            <span class="shrink-0 text-xs text-muted-foreground">
                                                                {formatRuntime(episode.runtime)}
                                                            </span>
                                                        {/if}
                                                    </span>
                                                    {#if getEpisodeStatusLabel(episode)}
                                                        <span class="text-xs text-yellow-500">
                                                            {getEpisodeStatusLabel(episode)}
                                                        </span>
                                                    {/if}
                                                </span>
                                                <Play
                                                    class="h-4 w-4 fill-current text-primary opacity-0 transition-opacity group-hover:opacity-100"
                                                />
                                            </button>
                                        {/each}
                                        {#if season.episodes.length === 0}
                                            <div class="px-4 py-3 text-center text-sm text-muted-foreground">
                                                No episodes available
                                            </div>
                                        {/if}
                                    </div>
                                </Accordion.Content>
                            </Accordion.Item>
                        {/each}
                    </Accordion.Root>
                {/if}
            </Popover.Content>
        </Popover.Portal>
    </Popover.Root>
</div>
