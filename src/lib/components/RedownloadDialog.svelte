<script lang="ts">
    import { RotateCcw } from "@lucide/svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import Dialog from "$lib/components/ui/Dialog.svelte";
    import Input from "$lib/components/ui/Input.svelte";
    import { createRetryMediaMutation } from "$lib/data/media";
    import type { Media } from "$lib/types";

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
    let manualSource = $state("");
    let retryError = $state("");
    let retrying = $state(false);

    const title = $derived(media ? `Redownload ${media.title || `Episode ${media.episodeNumber}`}` : "Redownload");

    $effect(() => {
        if (open) {
            manualSource = "";
            retryError = "";
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
        }
    }

    async function handleManualSubmit() {
        const magnetLink = manualSource.trim();
        if (!magnetLink) {
            return;
        }
        await runRetry("replace", magnetLink);
    }
</script>

<Dialog
    bind:open
    {title}
    description="Reuse the saved source or paste a magnet link or torrent URL manually."
    class="max-w-xl"
>
    <div class="space-y-5 py-1">
        <div class="space-y-3">
            <div class="space-y-1">
                <p class="text-sm font-medium">Saved source</p>
                <p class="text-sm text-muted-foreground">Retry the source already stored on this title.</p>
            </div>
            <Button onclick={() => runRetry("same")} disabled={!media?.magnetLink || retrying}>
                <RotateCcw class="mr-2 h-4 w-4" />
                {retrying ? "Retrying..." : "Retry saved source"}
            </Button>
            {#if media && !media.magnetLink}
                <p class="text-sm text-muted-foreground">
                    This title does not have a saved source yet. Paste a new one below.
                </p>
            {/if}
        </div>

        <div class="space-y-3 border-t border-border pt-4">
            <div class="space-y-1">
                <p class="text-sm font-medium">Manual source</p>
                <p class="text-sm text-muted-foreground">Paste a magnet link or a direct torrent URL.</p>
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
