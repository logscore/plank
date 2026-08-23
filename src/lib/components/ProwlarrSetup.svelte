<script lang="ts">
    import IndexerManager from "$lib/components/IndexerManager.svelte";

    // Props
    let { prowlarrUrl, hasApiKey } = $props<{
        prowlarrUrl: string;
        hasApiKey: boolean;
    }>();
</script>

<div class="max-w-4xl mx-auto p-6">
    <div class="mb-8 text-center">
        <h2 class="text-3xl font-bold mb-2">Configure Indexers</h2>
        <p class="text-muted-foreground">Select your preferred torrent providers to start streaming content.</p>
    </div>

    {#if hasApiKey}
        <IndexerManager {prowlarrUrl} useStoredConfig />
    {:else}
        <div class="bg-muted/30 p-8 rounded-xl text-center border border-dashed">
            <h3 class="font-semibold mb-2 text-balance">Configuration Required</h3>
            <p class="text-muted-foreground mb-4 text-pretty">
                Prowlarr API Key is missing. Please configure it in Settings.
            </p>
            <a
                href="/settings#prowlarr"
                class="inline-flex items-center justify-center px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90"
            >
                Go to Settings
            </a>
        </div>
    {/if}
</div>
