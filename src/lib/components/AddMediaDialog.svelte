<script lang="ts">
    import { Film, Tv } from "@lucide/svelte";
    import { onDestroy } from "svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import Dialog from "$lib/components/ui/Dialog.svelte";
    import Input from "$lib/components/ui/Input.svelte";
    import { createAddMediaMutation } from "$lib/data/media";
    import type { MediaType } from "$lib/types";
    import { uiState } from "$lib/ui-state.svelte";

    // Mutation hook
    const addMediaMutation = createAddMediaMutation();

    // UI State
    let magnetInput = $state("");
    let selectedType = $state<MediaType | null>(null);
    let error = $state("");

    function reset() {
        magnetInput = "";
        selectedType = null;
        error = "";
    }

    // Closing must not leave a stale magnet or error for the next open.
    $effect(() => {
        if (!uiState.addMediaDialogOpen) {
            reset();
        }
    });

    // The nav unmounts this on /watch, /profiles and /onboarding. Drop the
    // flag too, so the dialog does not reopen itself on the way back.
    onDestroy(() => {
        uiState.addMediaDialogOpen = false;
    });

    async function addMagnet() {
        const magnetLink = magnetInput.trim();
        if (!magnetLink) {
            error = "Please enter a magnet link";
            return;
        }
        if (!magnetLink.startsWith("magnet:")) {
            error = "Invalid magnet link format";
            return;
        }

        error = "";

        try {
            await addMediaMutation.mutateAsync({
                magnetLink,
                type: selectedType ?? undefined,
            });
            reset();
            uiState.addMediaDialogOpen = false;
        } catch (cause) {
            error = cause instanceof Error ? cause.message : "Failed to add media";
        }
    }
</script>

<Dialog
    bind:open={uiState.addMediaDialogOpen}
    title="Add Media"
    description="Paste a magnet link to start downloading."
>
    <div class="grid gap-4 py-4">
        <Input
            placeholder="magnet:?xt=urn:btih:..."
            bind:value={magnetInput}
            onkeydown={(e: KeyboardEvent) => e.key === "Enter" && addMagnet()}
            autofocus
        />

        <!-- Type selector -->
        <div class="flex gap-2">
            <span class="text-sm text-muted-foreground self-center">Type:</span>
            <Button
                variant={selectedType === null ? "default" : "ghost"}
                size="sm"
                onclick={() => (selectedType = null)}
            >
                Auto-detect
            </Button>
            <Button
                variant={selectedType === "movie" ? "default" : "ghost"}
                size="sm"
                onclick={() => (selectedType = "movie")}
            >
                <Film class="w-3 h-3 mr-1" />
                Movie
            </Button>
            <Button
                variant={selectedType === "show" ? "default" : "ghost"}
                size="sm"
                onclick={() => (selectedType = "show")}
            >
                <Tv class="w-3 h-3 mr-1" />
                TV Show
            </Button>
        </div>

        {#if error}
            <p class="text-sm text-destructive">{error}</p>
        {/if}
    </div>
    <div class="flex justify-end gap-2">
        <Button variant="ghost" onclick={() => (uiState.addMediaDialogOpen = false)}>Cancel</Button>
        <Button onclick={addMagnet} disabled={addMediaMutation.isPending}>
            {addMediaMutation.isPending ? "Adding..." : "Add Media"}
        </Button>
    </div>
</Dialog>
