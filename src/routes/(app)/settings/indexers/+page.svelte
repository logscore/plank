<script lang="ts">
    import IndexerManager from "$lib/components/IndexerManager.svelte";
    import Section from "../Section.svelte";
    import type { PageData } from "./$types";

    let { data } = $props<{ data: PageData }>();
</script>

<div class="divide-y divide-white/10">
    {#if data.hasProwlarr}
        <div class="py-10">
            <IndexerManager />
        </div>
    {:else}
        <Section
            title="Prowlarr is not connected"
            description="Add the Prowlarr URL and API key before you add indexers."
        >
            <a
                href="/settings/connections"
                class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
                Open Connections
            </a>
        </Section>
    {/if}
</div>
