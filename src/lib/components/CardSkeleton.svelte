<script lang="ts">
    import { cn } from '$lib/utils';

    let { class: className }: { class?: string } = $props();
</script>

<div
    class={cn(
        "relative aspect-2/3 rounded-lg bg-muted/30 animate-pulse border border-border/50",
        className
    )}
    role="status"
    aria-label="Loading movie..."
>
    <div class="absolute inset-0 flex items-center justify-center">
        <div class="w-1/3 h-1/3 bg-muted/20 rounded-full blur-xl"></div>
    </div>
</div>
