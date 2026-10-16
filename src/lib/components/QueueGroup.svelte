<script lang="ts">
    import { ChevronRight } from "@lucide/svelte";
    import type { Snippet } from "svelte";

    let {
        title,
        count,
        children,
    }: {
        title: string;
        count: number;
        children: Snippet;
    } = $props();

    let open = $state(true);
</script>

{#if count > 0}
    <section class="mb-10">
        <button
            type="button"
            class="mb-4 flex items-center gap-2 text-xl font-semibold text-white"
            onclick={() => (open = !open)}
        >
            <ChevronRight class="h-4 w-4 text-muted-foreground transition-transform {open ? 'rotate-90' : ''}" />
            {title}
            <span class="text-sm font-normal text-muted-foreground">{count}</span>
        </button>
        {#if open}
            <div class="space-y-4">{@render children()}</div>
        {/if}
    </section>
{/if}
