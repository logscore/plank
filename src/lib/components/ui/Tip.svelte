<script lang="ts">
    import { Tooltip } from "bits-ui";
    import type { Snippet } from "svelte";

    let {
        text,
        side = "top",
        children,
    }: {
        text: string;
        side?: "top" | "right" | "bottom" | "left";
        // Apply the given props to the element that must show the tooltip.
        children: Snippet<[Record<string, unknown>]>;
    } = $props();
</script>

<Tooltip.Provider delayDuration={300}>
    <Tooltip.Root>
        <Tooltip.Trigger>
            {#snippet child({ props })}
                {@render children(props)}
            {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Portal>
            <Tooltip.Content
                {side}
                sideOffset={8}
                class="z-70 rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-xs text-white shadow-xl"
            >
                {text}
            </Tooltip.Content>
        </Tooltip.Portal>
    </Tooltip.Root>
</Tooltip.Provider>
