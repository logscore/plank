<script lang="ts">
    import { ArrowLeft, Check, ClosedCaption, Plus } from "@lucide/svelte";
    import { Popover, Switch } from "bits-ui";
    import { untrack } from "svelte";
    import type { TextTrack } from "vidstack";
    import type { MediaPlayerElement } from "vidstack/elements";
    import { getCaptionSelection, setCaptionSelection } from "$lib/caption-session.svelte";
    import OpenSubtitlesSearch from "$lib/components/OpenSubtitlesSearch.svelte";
    import type { SubtitleTrackResponse } from "$lib/types";

    let {
        player,
        mediaId,
        mediaTitle,
    }: {
        player: MediaPlayerElement;
        mediaId: string;
        mediaTitle: string;
    } = $props();

    let open = $state(false);
    let searching = $state(false);
    let tracks = $state<TextTrack[]>([]);
    let selectedId = $state<string | null>(null);

    // The web-component layout has no control slots. Place our trigger beside its
    // caption control, and reattach it when Vidstack changes responsive layouts.
    function placeControl(node: HTMLElement) {
        function place() {
            const anchor = player.querySelector<HTMLElement>(".vds-caption-tooltip");
            node.hidden = !anchor;
            if (anchor?.parentElement && node.nextSibling !== anchor) {
                anchor.style.display = "none";
                anchor.before(node);
            }
        }
        const observer = new MutationObserver(place);
        observer.observe(player, { childList: true, subtree: true });
        place();
        return {
            destroy() {
                observer.disconnect();
                player.querySelector<HTMLElement>(".vds-caption-tooltip")?.style.removeProperty("display");
            },
        };
    }

    $effect(() => {
        const list = player.textTracks;
        const id = mediaId;
        const initialSelection = untrack(() => getCaptionSelection(id));
        let restoreSelection = initialSelection?.enabled ?? false;
        function syncTracks() {
            tracks = list.getByKind(["captions", "subtitles"]);
            selectedId = list.selected?.id ?? null;
        }
        function onTracksChange() {
            syncTracks();
            if (restoreSelection && initialSelection?.trackId && list.getById(initialSelection.trackId)) {
                restoreSelection = false;
                selectTrack(initialSelection.trackId);
            }
        }
        function onSelectionChange() {
            restoreSelection = false;
            syncTracks();
            const rememberedId = getCaptionSelection(id)?.trackId ?? null;
            setCaptionSelection(id, list.selected?.id ?? rememberedId, list.selected !== null);
        }
        list.addEventListener("add", onTracksChange);
        list.addEventListener("remove", onTracksChange);
        list.addEventListener("mode-change", onSelectionChange);
        untrack(onTracksChange);
        return () => {
            list.removeEventListener("add", onTracksChange);
            list.removeEventListener("remove", onTracksChange);
            list.removeEventListener("mode-change", onSelectionChange);
        };
    });

    $effect(() => {
        if (!open) {
            return;
        }
        const controls = player.controls;
        controls.pause();
        return () => controls.resume();
    });

    function selectTrack(id: string | null) {
        for (const track of player.textTracks.getByKind(["captions", "subtitles"])) {
            track.setMode(track.id === id ? "showing" : "disabled");
        }
    }

    function toggleCaptions(enabled: boolean) {
        const rememberedId = getCaptionSelection(mediaId)?.trackId;
        const track = tracks.find((item) => item.id === rememberedId) ?? tracks[0];
        selectTrack(enabled ? (track?.id ?? null) : null);
    }

    function handleDownloaded(track: SubtitleTrackResponse) {
        if (track.mediaId !== mediaId || !player.isConnected) {
            return;
        }
        if (!player.textTracks.getById(track.id)) {
            player.textTracks.add({
                id: track.id,
                src: track.src,
                label: track.label,
                language: track.language,
                kind: "subtitles",
                type: "vtt",
            });
        }
        selectTrack(track.id);
    }
</script>

<span use:placeControl class="inline-flex shrink-0">
    <Popover.Root bind:open onOpenChange={(value) => { if (value) searching = false; }}>
        <Popover.Trigger
            class="vds-button relative"
            aria-label="Subtitles"
            title="Subtitles"
            data-active={selectedId !== null ? "" : undefined}
        >
            <ClosedCaption class="h-6 w-6" />
            {#if selectedId !== null}
                <span class="absolute bottom-1 h-0.5 w-4 rounded-full bg-primary"></span>
            {/if}
        </Popover.Trigger>
        <Popover.Portal to={player}>
            <Popover.Content
                side="top"
                align="end"
                sideOffset={12}
                collisionPadding={12}
                onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    player.focus({ preventScroll: true });
                }}
                aria-label={searching ? "Add Captions" : "Captions"}
                class="z-60 max-h-(--bits-popover-content-available-height) w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-white/10 bg-zinc-950/95 text-foreground shadow-2xl backdrop-blur-xl focus:outline-none {searching ? 'max-w-lg' : 'max-w-xs'}"
            >
                <div class="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                    {#if searching}
                        <button
                            type="button"
                            class="rounded-md p-1 text-zinc-400 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-primary"
                            onclick={() => (searching = false)}
                            aria-label="Back to subtitle selection"
                        >
                            <ArrowLeft class="h-4 w-4" />
                        </button>
                    {/if}
                    <div class="min-w-0 flex-1">
                        <h2 class="text-sm font-semibold text-white">{searching ? "Add Captions" : "Captions"}</h2>
                        {#if searching}
                            <p class="truncate text-xs text-zinc-400">{mediaTitle}</p>
                        {/if}
                    </div>
                    {#if !searching}
                        <Switch.Root
                            checked={selectedId !== null}
                            onCheckedChange={toggleCaptions}
                            disabled={tracks.length === 0}
                            aria-label="Enable captions"
                            class="inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-white/20 p-0.5 transition-colors data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-primary"
                        >
                            <Switch.Thumb
                                class="h-5 w-5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-4"
                            />
                        </Switch.Root>
                    {/if}
                </div>

                {#if searching}
                    <div class="p-3">
                        <OpenSubtitlesSearch {mediaId} portalTarget={player} onDownloaded={handleDownloaded} />
                    </div>
                {:else}
                    <div class="max-h-64 space-y-1 overflow-y-auto p-2" role="group" aria-label="Subtitle tracks">
                        {#each tracks as track (track.id)}
                            <button
                                type="button"
                                class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-primary"
                                aria-pressed={selectedId === track.id}
                                onclick={() => selectTrack(track.id)}
                            >
                                <Check
                                    class="h-4 w-4 shrink-0 {selectedId === track.id ? 'text-primary' : 'invisible'}"
                                />
                                <span class="min-w-0 flex-1 truncate"
                                    >{track.label || track.language || "Subtitles"}</span
                                >
                                <span class="text-xs uppercase text-zinc-400">{track.language}</span>
                            </button>
                        {:else}
                            <p class="px-3 py-4 text-center text-sm text-zinc-400">
                                No subtitles yet. Find a track below.
                            </p>
                        {/each}
                    </div>
                    <div class="border-t border-white/10 p-2">
                        <button
                            type="button"
                            class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-primary"
                            onclick={() => (searching = true)}
                        >
                            <Plus class="h-4 w-4 text-zinc-400" />
                            Add captions
                        </button>
                    </div>
                {/if}
            </Popover.Content>
        </Popover.Portal>
    </Popover.Root>
</span>
