<script lang="ts">
    import { ScrollArea } from "bits-ui";
    import type { Snippet } from "svelte";
    import { cn } from "$lib/utils";

    let {
        class: className,
        rootClass,
        children,
    }: {
        // Sizing for the scrolling area, for example "max-h-96".
        class?: string;
        rootClass?: string;
        children: Snippet;
    } = $props();
</script>

<ScrollArea.Root class={cn("relative", rootClass)}>
    <ScrollArea.Viewport class={className}>{@render children()}</ScrollArea.Viewport>
    <ScrollArea.Scrollbar
        orientation="vertical"
        class="flex w-2 touch-none select-none rounded-full p-0.5 transition-opacity duration-150 data-[state=hidden]:opacity-0"
    >
        <ScrollArea.Thumb class="flex-1 rounded-full bg-white/25" />
    </ScrollArea.Scrollbar>
</ScrollArea.Root>
