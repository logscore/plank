<script lang="ts">
    import { Check, ChevronDown, ClosedCaption, Plus, Trash2 } from "@lucide/svelte";
    import { Popover, Switch } from "bits-ui";
    import { getCaptionSelection, setCaptionSelection } from "$lib/caption-session.svelte";
    import Scroller from "$lib/components/ui/Scroller.svelte";
    import { createDeleteSubtitleMutation } from "$lib/data/media";
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
    let errorMessage = $state("");

    const deleteMutation = createDeleteSubtitleMutation();

    function selectTrack(track: SubtitleTrackResponse) {
        setCaptionSelection(mediaId, track.id, true);
    }

    function toggleCaptions(enabled: boolean) {
        const track = selectedTrack ?? tracks[0];
        setCaptionSelection(mediaId, track?.id ?? null, enabled);
    }

    async function handleDelete(track: SubtitleTrackResponse) {
        errorMessage = "";
        const id = mediaId;
        try {
            await deleteMutation.mutateAsync({ mediaId: id, subtitleId: track.id });
            if (getCaptionSelection(id)?.trackId === track.id) {
                setCaptionSelection(id, null, false);
            }
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : "Failed to remove subtitle";
        }
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
                return "Remote";
            case "manual":
                return "Manual";
            default:
                return source;
        }
    }

    const selection = $derived(getCaptionSelection(mediaId));
    const selectedTrack = $derived(tracks.find((track) => track.id === selection?.trackId));
    const activeTrackId = $derived(selection?.enabled ? selectedTrack?.id : null);
    const trackCount = $derived(tracks.length);
</script>

<Popover.Root bind:open={isOpen}>
    {#if compact}
        <Popover.Trigger
            class="inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {buttonClass}"
            aria-label="Captions"
        >
            <ClosedCaption class="h-6 w-6" />
        </Popover.Trigger>
    {:else}
        <Popover.Trigger
            class="inline-flex h-11 items-center justify-center rounded-md px-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {buttonClass}"
            aria-label="Captions"
        >
            <ClosedCaption class="mr-2 h-6 w-6" />
            <ChevronDown class="ml-2 h-4 w-4 shrink-0 transition-transform {isOpen ? 'rotate-180' : ''}" />
        </Popover.Trigger>
    {/if}
    <Popover.Portal>
        <Popover.Content
            side="bottom"
            align={compact ? "end" : "start"}
            sideOffset={8}
            aria-label="Captions"
            class="z-50 w-[calc(100vw-1.5rem)] max-w-xs overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 text-foreground shadow-2xl backdrop-blur-xl focus:outline-none"
        >
            <div class="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                <h3 class="text-sm font-semibold text-white">Captions</h3>
                <Switch.Root
                    checked={Boolean(activeTrackId)}
                    onCheckedChange={toggleCaptions}
                    disabled={tracks.length === 0 || deleteMutation.isPending}
                    aria-label="Enable captions"
                    class="inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-white/20 p-0.5 transition-colors data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-primary"
                >
                    <Switch.Thumb
                        class="h-5 w-5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-4"
                    />
                </Switch.Root>
            </div>

            {#if errorMessage}
                <p role="alert" class="px-4 py-3 text-sm text-destructive">{errorMessage}</p>
            {/if}

            <Scroller class="max-h-64 p-2">
                {#if tracks.length === 0}
                    <p class="px-3 py-4 text-center text-sm text-zinc-400">No captions yet. Find a track below.</p>
                {:else}
                    {#each tracks as track (track.id)}
                        <div class="group flex items-center gap-1 rounded-lg hover:bg-white/10">
                            <button
                                type="button"
                                class="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-primary disabled:opacity-50"
                                onclick={() => selectTrack(track)}
                                aria-pressed={activeTrackId === track.id}
                                disabled={deleteMutation.isPending}
                            >
                                <Check
                                    class="h-4 w-4 shrink-0 {activeTrackId === track.id ? 'text-primary' : 'invisible'}"
                                />
                                <span class="min-w-0 flex-1">
                                    <span class="truncate text-sm font-medium text-white">{track.label}</span>
                                    <!-- <span
                                            class="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                        >
                                            {getSourceLabel(track.source)}
                                        </span> -->
                                </span>
                            </button>
                            {#if track.source === "opensubtitles" || track.source === "manual"}
                                <button
                                    type="button"
                                    class="mr-2 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive hover:text-accent-foreground focus-visible:outline focus-visible:outline-primary disabled:opacity-50"
                                    onclick={() => handleDelete(track)}
                                    aria-label="Remove {track.label} subtitle"
                                    disabled={deleteMutation.isPending}
                                >
                                    <Trash2 class="h-3.5 w-3.5" />
                                </button>
                            {/if}
                        </div>
                    {/each}
                {/if}
            </Scroller>

            <div class="border-t border-white/10 p-2">
                <button
                    type="button"
                    class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-primary"
                    onclick={handleAdd}
                >
                    <Plus class="h-4 w-4 text-zinc-400" />
                    Add captions
                </button>
            </div>
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>
