<script lang="ts">
    import type { Snippet } from 'svelte';
    import Button from '$lib/components/ui/Button.svelte';

    interface Props {
        error: Error | null;
        refetch?: () => void;
        children?: Snippet;
    }

    let { error, refetch, children }: Props = $props();
</script>

{#if error}
    <div class="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
        <h3 class="text-destructive font-semibold mb-1">Something went wrong</h3>
        <p class="text-destructive/80 text-sm mb-3">{error.message}</p>
        {#if refetch}
            <Button variant="destructive" size="sm" onclick={refetch}>Try Again</Button>
        {/if}
    </div>
{:else if children}
    {@render children()}
{/if}
