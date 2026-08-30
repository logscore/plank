<script lang="ts">
    import { Loader, RotateCcw } from "@lucide/svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import Dialog from "$lib/components/ui/Dialog.svelte";
    import Input from "$lib/components/ui/Input.svelte";
    import Scroller from "$lib/components/ui/Scroller.svelte";
    import { createMediaSourcesQuery, createRetryMediaMutation } from "$lib/data/media";
    import type { Media, SourceCandidate } from "$lib/types";
    import { formatFileSize } from "$lib/utils";

    let {
        open = $bindable(false),
        media,
        onRetried = null,
    }: {
        open?: boolean;
        media: Media | null;
        /** Runs after the retry is queued, so the caller can refresh its own data. */
        onRetried?: ((item: Media) => Promise<void> | void) | null;
    } = $props();

    const retryMutation = createRetryMediaMutation();
    const sourcesQuery = createMediaSourcesQuery(
        () => media?.id ?? null,
        () => open
    );
    let manualSource = $state("");
    let retryError = $state("");
    let retrying = $state(false);
    /** Infohash of the release the user just picked, so only that row shows progress. */
    let pendingInfohash = $state("");

    const title = $derived(media ? `Redownload "${media.title || `Episode ${media.episodeNumber}`}"` : "Redownload");
    const searchQuery = $derived(sourcesQuery.data?.query ?? "");
    const searchResults = $derived<SourceCandidate[]>(sourcesQuery.data?.results ?? []);
    // Cached releases stay on screen while a stale search refetches behind them.
    const searching = $derived(sourcesQuery.isFetching && searchResults.length === 0);
    const searchError = $derived(sourcesQuery.error && searchResults.length === 0 ? sourcesQuery.error.message : "");

    $effect(() => {
        if (open) {
            manualSource = "";
            retryError = "";
            pendingInfohash = "";
        }
    });

    async function runRetry(mode: "same" | "replace", magnetLink?: string) {
        if (!media || retrying) {
            return;
        }
        const item = media;
        retrying = true;
        retryError = "";
        try {
            await retryMutation.mutateAsync({ id: item.id, mode, magnetLink });
            await onRetried?.(item);
            open = false;
        } catch (error) {
            console.error("Failed to queue redownload:", error);
            retryError = error instanceof Error ? error.message : "Redownload failed";
        } finally {
            retrying = false;
            pendingInfohash = "";
        }
    }

    async function handleManualSubmit() {
        const magnetLink = manualSource.trim();
        if (!magnetLink) {
            return;
        }
        await runRetry("replace", magnetLink);
    }

    /** One column layout for the header and every row, so the values line up. */
    const SOURCE_COLUMNS =
        "grid items-center gap-3 grid-cols-[minmax(0,1fr)_4.5rem_3.5rem] sm:grid-cols-[minmax(0,1fr)_4.5rem_3.5rem_6.5rem]";

    /** Prowlarr sometimes reports no size, and formatFileSize rejects that. */
    function formatSize(bytes: number): string {
        return Number.isFinite(bytes) && bytes > 0 ? formatFileSize(bytes) : "—";
    }

    async function useCandidate(candidate: SourceCandidate) {
        pendingInfohash = candidate.infohash;
        await runRetry("replace", candidate.magnetUri);
    }
</script>

<Dialog bind:open {title} class="max-w-xl">
    <div class="space-y-5 py-1">
        <div class="space-y-3">
            <div class="space-y-1">
                <p class="text-sm font-medium">Retry same source</p>
            </div>
            <Button onclick={() => runRetry("same")} disabled={!media?.magnetLink || retrying}>
                <RotateCcw class="mr-2 h-4 w-4" />
                {retrying ? "Retrying..." : "Retry"}
            </Button>
            {#if media && !media.magnetLink}
                <p class="text-sm text-muted-foreground">
                    This title does not have a saved source yet. Paste a new one below.
                </p>
            {/if}
        </div>

        <div class="space-y-3 border-t border-border pt-4">
            <div class="space-y-1">
                <p class="text-sm font-medium">Other sources</p>
                {#if searchQuery}
                    <p class="text-sm text-muted-foreground">Indexer results for "{searchQuery}"</p>
                {/if}
            </div>

            {#if searchError}
                <p class="text-sm text-destructive">{searchError}</p>
            {:else}
                <div class="overflow-hidden rounded-lg border border-border/60">
                    <div
                        class="{SOURCE_COLUMNS} border-b border-border/60 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground"
                    >
                        <span>Release</span>
                        <span class="text-right">Size</span>
                        <span class="text-right">Seeders</span>
                        <span class="hidden sm:block">Source</span>
                    </div>
                    {#if searching}
                        <div class="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                            <Loader class="h-4 w-4 animate-spin" />
                            Searching indexers...
                        </div>
                    {:else if searchResults.length === 0}
                        <p class="px-3 py-4 text-sm text-muted-foreground">
                            No releases found. Paste a source below instead.
                        </p>
                    {:else}
                        <Scroller class="max-h-64">
                            <div class="divide-y divide-border/40">
                                {#each searchResults as candidate (candidate.infohash)}
                                    <button
                                        type="button"
                                        class="{SOURCE_COLUMNS} w-full px-3 py-2 text-left transition-colors hover:bg-white/5 disabled:opacity-50"
                                        disabled={retrying}
                                        onclick={() => useCandidate(candidate)}
                                    >
                                        <span class="flex min-w-0 items-center gap-1.5">
                                            {#if pendingInfohash === candidate.infohash}
                                                <Loader class="h-3 w-3 shrink-0 animate-spin" />
                                            {/if}
                                            <!--
                                                Long release names scroll sideways here, so the other columns
                                                stay put. The mask fades the text into the right edge, which
                                                shows there is more to read.
                                            -->
                                            <span
                                                class="no-scrollbar mask-r-from-[calc(100%-1.5rem)] min-w-0 overflow-x-auto whitespace-nowrap text-sm text-white"
                                                title={candidate.title}
                                            >
                                                {candidate.title}
                                            </span>
                                        </span>
                                        <span class="text-right text-xs tabular-nums text-muted-foreground">
                                            {formatSize(candidate.size)}
                                        </span>
                                        <span class="text-right text-xs tabular-nums text-muted-foreground">
                                            {candidate.seeders}
                                        </span>
                                        <span
                                            class="hidden truncate text-xs text-muted-foreground sm:block"
                                            title={candidate.indexer}
                                        >
                                            {candidate.indexer}
                                        </span>
                                    </button>
                                {/each}
                            </div>
                        </Scroller>
                    {/if}
                </div>
            {/if}
        </div>

        <div class="space-y-3 border-t border-border pt-4">
            <div class="space-y-1">
                <p class="text-sm font-medium">Manual source</p>
            </div>
            <Input
                bind:value={manualSource}
                placeholder="magnet:?xt=urn:btih:... or https://..."
                onkeydown={(event) => event.key === "Enter" && handleManualSubmit()}
            />
            <div class="flex justify-end gap-2">
                <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
                <Button onclick={handleManualSubmit} disabled={retrying || !manualSource.trim()}>
                    {retrying ? "Starting..." : "Use manual source"}
                </Button>
            </div>
        </div>

        {#if retryError}
            <p class="text-sm text-destructive">{retryError}</p>
        {/if}
    </div>
</Dialog>
