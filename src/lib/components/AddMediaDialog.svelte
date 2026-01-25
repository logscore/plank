<script lang="ts">
    import { Film, Tv } from '@lucide/svelte';
    import { goto } from '$app/navigation';
    import Button from '$lib/components/ui/Button.svelte';
    import Dialog from '$lib/components/ui/Dialog.svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import { createAddMediaMutation } from '$lib/mutations/media-mutations';
    import type { MediaType } from '$lib/types';
    import { uiState } from '$lib/ui-state.svelte';

    // Mutation hook
    const addMediaMutation = createAddMediaMutation();

    // UI State
    let magnetInput = $state('');
    let selectedType = $state<MediaType | null>(null);
    let error = $state('');

    async function addMagnet() {
        if (!magnetInput.trim()) {
            return;
        }

        error = '';

        try {
            const result = await addMediaMutation.mutateAsync({
                magnetLink: magnetInput,
                type: selectedType ?? undefined,
            });

            // Check if this was a season addition to an existing show
            // Note: result type might not imply _seasonAdded directly if strictly typed, but we use it in +page.svelte
            if (result._seasonAdded) {
                goto('?type=tv', { replaceState: true, noScroll: true });
            } else if (result.type === 'tv') {
                goto('?type=tv', { replaceState: true, noScroll: true });
            } else {
                goto('?type=movies', { replaceState: true, noScroll: true });
            }

            magnetInput = '';
            selectedType = null;
            uiState.addMediaDialogOpen = false;
        } catch (e) {
            error = e instanceof Error ? e.message : 'Failed to add media';
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
            onkeydown={(e) => e.key === "Enter" && addMagnet()}
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
                variant={selectedType === "tv" ? "default" : "ghost"}
                size="sm"
                onclick={() => (selectedType = "tv")}
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
