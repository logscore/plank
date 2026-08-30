<script lang="ts">
    import { EllipsisVertical, Play, RotateCcw, Trash2 } from "@lucide/svelte";
    import { DropdownMenu } from "bits-ui";
    import SubtitleMenu from "$lib/components/SubtitleMenu.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import type { Media, SubtitleTrackResponse } from "$lib/types";
    import { canPlayEpisode } from "$lib/utils";

    let {
        media,
        label = null,
        busy = false,
        subtitleTracks = [],
        onPlay,
        onRedownload,
        onRemoveDownload,
        onAddSubtitles = null,
    }: {
        media: Media;
        /** Small line above the title, such as "Breaking Bad - S01E02". */
        label?: string | null;
        busy?: boolean;
        subtitleTracks?: SubtitleTrackResponse[];
        onPlay: (item: Media) => void;
        onRedownload: (item: Media) => void;
        onRemoveDownload: (item: Media) => void;
        onAddSubtitles?: ((item: Media) => void) | null;
    } = $props();

    const isRemoved = $derived(media.status === "removed");
    const thumbnail = $derived(media.stillPath ?? media.backdropUrl ?? media.posterUrl);

    function statusLabel(item: Media): string {
        if (item.status === "complete" || item.filePath) {
            return "Downloaded";
        }
        switch (item.status) {
            case "removed":
                return "Removed";
            case "searching":
                return "Searching";
            case "downloading":
                return "Downloading";
            case "not_found":
                return "Not Found";
            case "error":
                return "Error";
            default:
                return "Pending";
        }
    }

    function statusClass(item: Media): string {
        if (item.status === "complete" || item.filePath) {
            return "bg-emerald-500 text-emerald-100";
        }
        switch (item.status) {
            case "removed":
                return "bg-rose-500 text-rose-100";
            case "downloading":
                return "bg-blue-500 text-blue-100";
            case "searching":
                return "bg-amber-500 text-amber-100";
            case "not_found":
            case "error":
                return "bg-red-500 text-red-100";
            default:
                return "bg-muted text-muted-foreground";
        }
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

<div
    class="group flex gap-4 rounded-2xl border bg-card/70 p-4 transition-colors {isRemoved
        ? 'border-rose-500/40 bg-rose-500/5'
        : 'border-border hover:border-primary/50'}"
>
    <div class="relative aspect-video w-32 shrink-0 overflow-hidden rounded bg-accent md:w-48">
        {#if thumbnail}
            <img src={thumbnail} alt={media.title} class="h-full w-full object-cover">
        {:else}
            <div class="flex h-full w-full items-center justify-center text-muted-foreground">
                <Play class="h-8 w-8" />
            </div>
        {/if}
        <div class="absolute right-1 bottom-1 rounded px-1.5 py-0.5 text-[10px] {statusClass(media)}">
            {statusLabel(media)}
        </div>
    </div>

    <div class="flex min-w-0 flex-1 flex-col justify-between py-1">
        <div>
            {#if label}
                <p class="truncate text-xs text-muted-foreground">{label}</p>
            {/if}
            <h3 class="line-clamp-1 text-base font-semibold md:text-lg">
                {#if media.type === "episode" && media.episodeNumber !== null}
                    <span class="mr-1 text-muted-foreground">{media.episodeNumber}.</span>
                {/if}
                {media.title || `Episode ${media.episodeNumber}`}
            </h3>

            <div class="mt-1 flex items-center gap-3 text-xs text-muted-foreground md:text-sm">
                {#if media.runtime}
                    <span>{formatRuntime(media.runtime)}</span>
                {/if}
                {#if media.airDate}
                    <span>• {media.airDate}</span>
                {:else if media.year}
                    <span>• {media.year}</span>
                {/if}
            </div>
        </div>

        <div class="mt-2 flex items-center justify-between md:mt-0">
            {#if media.overview}
                <p class="hidden line-clamp-2 pr-4 text-xs text-muted-foreground md:block">{media.overview}</p>
            {/if}

            <div class="ml-auto flex shrink-0 items-center gap-1">
                {#if onAddSubtitles}
                    <SubtitleMenu
                        mediaId={media.id}
                        tracks={subtitleTracks}
                        onAddSubtitles={() => onAddSubtitles(media)}
                        compact
                    />
                {/if}
                <Button size="sm" disabled={!canPlayEpisode(media)} onclick={() => onPlay(media)}>
                    <Play class="mr-1 h-4 w-4 fill-current" />
                    Play
                </Button>
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger
                        class="inline-flex h-10 w-10 items-center justify-center rounded-md text-white transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                        aria-label="Download actions"
                    >
                        <EllipsisVertical class="h-4 w-4" />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                        <DropdownMenu.Content
                            side="bottom"
                            align="end"
                            sideOffset={8}
                            class="z-50 w-44 overflow-hidden rounded-xl border border-white/10 bg-black/95 p-1.5 text-gray-200 shadow-2xl backdrop-blur-xl focus:outline-none"
                        >
                            <DropdownMenu.Item
                                disabled={busy}
                                onSelect={() => onRedownload(media)}
                                class="flex h-10 cursor-default select-none items-center gap-2 rounded-lg px-3 text-sm outline-none data-highlighted:bg-white/10 data-disabled:pointer-events-none data-disabled:opacity-50"
                            >
                                <RotateCcw class="h-4 w-4" />
                                {busy ? "Working..." : "Redownload"}
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                                disabled={busy || isRemoved}
                                onSelect={() => onRemoveDownload(media)}
                                class="flex h-10 cursor-default select-none items-center gap-2 rounded-lg px-3 text-sm text-red-400 outline-none data-highlighted:bg-red-500/10 data-disabled:pointer-events-none data-disabled:opacity-50"
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
</div>
