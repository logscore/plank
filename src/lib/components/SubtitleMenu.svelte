<script lang="ts">
    import { Check, ChevronDown, Globe, Plus, Trash2 } from '@lucide/svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import { createDeleteSubtitleMutation, createSetDefaultSubtitleMutation } from '$lib/mutations/media-mutations';
    import type { SubtitleTrackResponse } from '$lib/queries/media-queries';
    import { createSubtitleTracksQuery } from '$lib/queries/media-queries';

    let {
        mediaId,
        episodeId,
        onAddSubtitles,
        buttonSize = 'lg',
        buttonClass = '',
        compact = false,
    }: {
        mediaId: string;
        episodeId?: string;
        onAddSubtitles: () => void;
        buttonSize?: 'default' | 'sm' | 'lg' | 'icon';
        buttonClass?: string;
        compact?: boolean;
    } = $props();

    let isOpen = $state(false);
    let menuRef = $state<HTMLDivElement | null>(null);

    const subtitlesQuery = createSubtitleTracksQuery(mediaId, episodeId);
    const tracks = $derived(subtitlesQuery.data ?? []);

    const setDefaultMutation = createSetDefaultSubtitleMutation();
    const deleteMutation = createDeleteSubtitleMutation();

    function toggleMenu() {
        isOpen = !isOpen;
    }

    function handleClickOutside(event: MouseEvent) {
        if (menuRef && !menuRef.contains(event.target as Node)) {
            isOpen = false;
        }
    }

    function handleSetDefault(track: SubtitleTrackResponse) {
        setDefaultMutation.mutate({
            mediaId,
            subtitleId: track.id,
            isDefault: !track.isDefault,
            episodeId,
        });
    }

    function handleDelete(track: SubtitleTrackResponse) {
        deleteMutation.mutate({
            mediaId,
            subtitleId: track.id,
            episodeId,
        });
    }

    function handleAdd() {
        isOpen = false;
        onAddSubtitles();
    }

    function getSourceLabel(source: string): string {
        switch (source) {
            case 'embedded':
                return 'Embedded';
            case 'sidecar':
                return 'File';
            case 'opensubtitles':
                return 'OpenSub';
            case 'manual':
                return 'Manual';
            default:
                return source;
        }
    }

    const defaultTrack = $derived(tracks.find((t: SubtitleTrackResponse) => t.isDefault));
    const trackCount = $derived(tracks.length);

    $effect(() => {
        if (isOpen) {
            document.addEventListener('click', handleClickOutside);
        } else {
            document.removeEventListener('click', handleClickOutside);
        }
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    });
</script>

<div class="relative" bind:this={menuRef}>
    <!-- Trigger Button -->
    {#if compact}
        <Button
            variant="ghost"
            size="sm"
            class="h-8 px-2 text-muted-foreground hover:text-white {buttonClass}"
            onclick={toggleMenu}
        >
            <Globe class="w-4 h-4" />
            {#if trackCount > 0}
                <span class="text-xs ml-1">{trackCount}</span>
            {/if}
        </Button>
    {:else}
        <Button
            variant="ghost"
            size={buttonSize}
            class="text-white hover:bg-neutral-800 {buttonClass}"
            onclick={toggleMenu}
        >
            <Globe class="w-5 h-5 mr-2" />
            Subtitles
            {#if trackCount > 0}
                <span class="ml-1 text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full"> {trackCount} </span>
            {/if}
            <ChevronDown class="w-4 h-4 ml-2 transition-transform shrink-0 {isOpen ? 'rotate-180' : ''}" />
        </Button>
    {/if}

    <!-- Dropdown Menu -->
    {#if isOpen}
        <div
            class="absolute top-full {compact ? 'right-0' : 'left-0'} mt-2 w-72 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden"
        >
            <!-- Header -->
            <div class="px-4 py-2.5 border-b border-border bg-accent/30">
                <h3 class="text-sm font-medium text-white">Subtitles</h3>
                {#if defaultTrack}
                    <p class="text-xs text-muted-foreground mt-0.5">Default: {defaultTrack.label}</p>
                {:else}
                    <p class="text-xs text-muted-foreground mt-0.5">No default set</p>
                {/if}
            </div>

            <!-- Subtitle List -->
            <div class="max-h-64 overflow-y-auto">
                {#if tracks.length === 0}
                    <div class="px-4 py-6 text-center text-sm text-muted-foreground">No subtitles available</div>
                {:else}
                    {#each tracks as track (track.id)}
                        <div
                            class="flex items-center gap-2 px-3 py-2.5 hover:bg-accent/30 transition-colors group border-b border-border/50 last:border-b-0"
                        >
                            <!-- Default indicator / toggle -->
                            <button
                                class="w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors {track.isDefault
                                    ? 'border-primary bg-primary/20 text-primary'
                                    : 'border-white/20 text-transparent hover:border-white/40 hover:text-white/40'}"
                                onclick={() => handleSetDefault(track)}
                                title={track.isDefault ? 'Remove as default' : 'Set as default'}
                            >
                                <Check class="w-3 h-3" />
                            </button>

                            <!-- Track info -->
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                    <span class="text-sm font-medium text-white truncate"> {track.label} </span>
                                    <span
                                        class="text-[10px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground shrink-0"
                                    >
                                        {getSourceLabel(track.source)}
                                    </span>
                                    {#if track.isForced}
                                        <span
                                            class="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 shrink-0"
                                        >
                                            Forced
                                        </span>
                                    {/if}
                                </div>
                                <span class="text-xs text-muted-foreground uppercase"> {track.language} </span>
                            </div>

                            <!-- Delete button (only for opensubtitles/manual) -->
                            {#if track.source === 'opensubtitles' || track.source === 'manual'}
                                <button
                                    class="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                                    onclick={() => handleDelete(track)}
                                    title="Remove subtitle"
                                >
                                    <Trash2 class="w-3.5 h-3.5" />
                                </button>
                            {/if}
                        </div>
                    {/each}
                {/if}
            </div>

            <!-- Add button -->
            <div class="border-t border-border p-2">
                <button
                    class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-white hover:bg-accent/50 transition-colors"
                    onclick={handleAdd}
                >
                    <Plus class="w-4 h-4" />
                    Search OpenSubtitles
                </button>
            </div>
        </div>
    {/if}
</div>
