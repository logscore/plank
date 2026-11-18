<script lang="ts">
    import type { Snippet } from "svelte";

    let {
        title,
        description,
        action,
        children,
    }: {
        title: string;
        description?: string;
        action?: Snippet;
        children: Snippet;
    } = $props();
</script>

<section class="rounded-2xl border border-white/10 bg-card/60 p-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
            <h3 class="text-lg font-semibold text-white">{title}</h3>
            {#if description}
                <p class="mt-1 max-w-prose text-sm text-muted-foreground text-pretty">{description}</p>
            {/if}
        </div>
        {#if action}
            <div class="shrink-0">{@render action()}</div>
        {/if}
    </div>
    <div class="mt-5">{@render children()}</div>
</section>
