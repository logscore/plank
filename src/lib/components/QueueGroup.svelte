<script lang="ts">
    import { ChevronRight } from "@lucide/svelte";
    import type { Snippet } from "svelte";

    let {
        title,
        count,
        open = $bindable(true),
        children,
    }: {
        title: string;
        count: number;
        open?: boolean;
        children: Snippet;
    } = $props();
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
