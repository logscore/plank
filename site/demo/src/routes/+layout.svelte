<script lang="ts">
    import { onMount } from 'svelte';
    import { Toaster } from 'svelte-sonner';
    import '../app.css';
    import DemoBanner from '$lib/components/DemoBanner.svelte';
    import { demoStore } from '$lib/demo/store.svelte';

    let { children } = $props();

    onMount(() => {
        demoStore.init();
    });
</script>

<DemoBanner />

<div class="pt-11">
    {#if demoStore.initialized}
        {@render children()}
    {:else}
        <div class="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
            Loading…
        </div>
    {/if}
</div>

<Toaster position="bottom-left" duration={2500} richColors />
