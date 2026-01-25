<script lang="ts">
    import { goto } from '$app/navigation';
    import Button from '$lib/components/ui/Button.svelte';
    import type { PageData } from './$types';

    let { data } = $props<{ data: PageData }>();
</script>

<div class="flex items-center justify-center min-h-[80vh]">
    <div
        class="w-full max-w-md bg-card/50 backdrop-blur-xl rounded-xl p-8 border border-white/10 shadow-2xl text-center"
    >
        {#if data.error}
            <div class="mb-6">
                <div class="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
                    <span class="text-3xl">❌</span>
                </div>
                <h1 class="text-2xl font-bold text-destructive mb-2">Invitation Error</h1>
                <p class="text-muted-foreground">{data.error}</p>
            </div>
            <Button onclick={() => goto('/')}>Go Home</Button>
        {:else}
            <div class="mb-6">
                <div
                    class="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4 animate-pulse"
                >
                    <span class="text-3xl">🔄</span>
                </div>
                <h1 class="text-2xl font-bold mb-2">Joining Organization...</h1>
            </div>
        {/if}
    </div>
</div>
