<script lang="ts">
    import { Loader2 } from "@lucide/svelte";
    import { fly } from "svelte/transition";
    import Button from "$lib/components/ui/Button.svelte";

    let {
        dirty,
        saving = false,
        label = "Unsaved changes",
        onsave,
        onreset,
    }: {
        dirty: boolean;
        saving?: boolean;
        label?: string;
        onsave: () => void;
        onreset: () => void;
    } = $props();
</script>

{#if dirty}
    <div
        class="sticky bottom-28 z-30 mt-10 flex items-center justify-between gap-4 rounded-full border border-white/10 bg-black/85 py-2 pr-2 pl-5 shadow-2xl backdrop-blur-xl"
        transition:fly={{ y: 12, duration: 160 }}
    >
        <p class="text-sm text-muted-foreground">{label}</p>
        <div class="flex items-center gap-1">
            <Button variant="ghost" size="sm" class="rounded-full" disabled={saving} onclick={onreset}>Discard</Button>
            <Button size="sm" class="rounded-full px-4" disabled={saving} onclick={onsave}>
                {#if saving}
                    <Loader2 class="mr-2 size-4 animate-spin" />
                {/if}
                Save
            </Button>
        </div>
    </div>
{/if}
