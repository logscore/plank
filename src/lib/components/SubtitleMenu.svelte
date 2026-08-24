<script lang="ts">
    import { Check, ChevronDown, ClosedCaption, Plus, Trash2 } from "@lucide/svelte";
    import { Popover } from "bits-ui";
    import { createDeleteSubtitleMutation, createSetDefaultSubtitleMutation } from "$lib/data/media";
    import type { SubtitleTrackResponse } from "$lib/types";

    let {
        mediaId,
        tracks,
        onAddSubtitles,
        buttonClass = "",
        compact = false,
    }: {
        mediaId: string;
        tracks: SubtitleTrackResponse[];
        onAddSubtitles: () => void;
        buttonClass?: string;
        compact?: boolean;
    } = $props();

    let isOpen = $state(false);

    const setDefaultMutation = createSetDefaultSubtitleMutation();
    const deleteMutation = createDeleteSubtitleMutation();

    function handleSetDefault(track: SubtitleTrackResponse) {
        setDefaultMutation.mutate({
            mediaId,
            subtitleId: track.id,
            isDefault: !track.isDefault,
        });
    }

    function handleDelete(track: SubtitleTrackResponse) {
        deleteMutation.mutate({
            mediaId,
            subtitleId: track.id,
        });
    }

    function handleAdd() {
        isOpen = false;
        onAddSubtitles();
    }

    function getSourceLabel(source: string): string {
        switch (source) {
            case "embedded":
                return "Embedded";
            case "sidecar":
                return "File";
            case "opensubtitles":
                return "OpenSub";
            case "manual":
                return "Manual";
            default:
                return source;
        }
    }

    const defaultTrack = $derived(tracks.find((t: SubtitleTrackResponse) => t.isDefault));
    const trackCount = $derived(tracks.length);
</script>

<Popover.Root bind:open={isOpen}>
    {#if compact}
        <Popover.Trigger
            class="inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {buttonClass}"
            aria-label="Subtitles"
        >
            <ClosedCaption class="h-6 w-6" />
            {#if trackCount > 0}
                <span class="ml-1 text-xs">{trackCount}</span>
            {/if}
        </Popover.Trigger>
    {:else}
        <Popover.Trigger
            class="inline-flex h-11 items-center justify-center rounded-md px-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {buttonClass}"
            aria-label="Subtitles"
        >
            <ClosedCaption class="mr-2 h-6 w-6" />
            {#if trackCount > 0}
                <span class="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-xs text-primary"> {trackCount} </span>
            {/if}
            <ChevronDown class="ml-2 h-4 w-4 shrink-0 transition-transform {isOpen ? 'rotate-180' : ''}" />
        </Popover.Trigger>
    {/if}
    <Popover.Portal>
        <Popover.Content
            side="bottom"
            align={compact ? "end" : "start"}
            sideOffset={8}
            class="z-50 w-72 overflow-hidden rounded-xl border border-white/10 bg-black/95 text-foreground shadow-2xl backdrop-blur-xl focus:outline-none"
        >
            <div class="border-b border-white/10 bg-white/5 px-4 py-2.5">
                <h3 class="text-sm font-medium text-white">Subtitles</h3>
                {#if defaultTrack}
                    <p class="mt-0.5 text-xs text-muted-foreground">Default: {defaultTrack.label}</p>
                {:else}
                    <p class="mt-0.5 text-xs text-muted-foreground">No default set</p>
                {/if}
            </div>

            <div class="max-h-64 overflow-y-auto">
                {#if tracks.length === 0}
                    <div class="px-4 py-6 text-center text-sm text-muted-foreground">No subtitles available</div>
                {:else}
                    {#each tracks as track (track.id)}
                        <div
                            class="group flex items-center gap-2 border-b border-white/8 px-3 py-2.5 transition-colors last:border-b-0 hover:bg-white/8"
                        >
                            <button
                                class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors {track.isDefault
                                    ? 'border-primary bg-primary/20 text-primary'
                                    : 'border-white/20 text-transparent hover:border-white/40 hover:text-white/40'}"
                                onclick={() => handleSetDefault(track)}
                                aria-label={track.isDefault
                                    ? "Remove as default"
                                    : "Set as default"}
                            >
                                <Check class="h-3 w-3" />
                            </button>
                            <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-2">
                                    <span class="truncate text-sm font-medium text-white">{track.label}</span>
                                    <span
                                        class="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                    >
                                        {getSourceLabel(track.source)}
                                    </span>
                                    {#if track.isForced}
                                        <span
                                            class="shrink-0 rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] text-yellow-400"
                                        >
                                            Forced
                                        </span>
                                    {/if}
                                </div>
                                <span class="text-xs uppercase text-muted-foreground">{track.language}</span>
                            </div>
                            {#if track.source === "opensubtitles" || track.source === "manual"}
                                <button
                                    class="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                                    onclick={() => handleDelete(track)}
                                    aria-label="Remove subtitle"
                                >
                                    <Trash2 class="h-3.5 w-3.5" />
                                </button>
                            {/if}
                        </div>
                    {/each}
                {/if}
            </div>

            <div class="border-t border-white/10 p-2">
                <button
                    class="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onclick={handleAdd}
                >
                    <Plus class="h-4 w-4" />
                    Search OpenSubtitles
                </button>
            </div>
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>
