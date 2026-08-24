<script lang="ts">
    import { Check, ChevronDown } from "@lucide/svelte";
    import { Select } from "bits-ui";
    import { cn } from "$lib/utils";

    interface SelectOption {
        value: string;
        label: string;
        disabled?: boolean;
    }

    let {
        value = $bindable(),
        items,
        placeholder = "Select an option",
        ariaLabel,
        class: className,
        onValueChange,
    }: {
        value?: string;
        items: SelectOption[];
        placeholder?: string;
        ariaLabel: string;
        class?: string;
        onValueChange?: (value: string) => void;
    } = $props();
</script>

<Select.Root type="single" {items} bind:value {onValueChange}>
    <Select.Trigger
        class={cn(
            "inline-flex h-10 min-w-32 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-foreground shadow-sm transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-placeholder:text-muted-foreground",
            className,
        )}
        aria-label={ariaLabel}
    >
        <Select.Value {placeholder} />
        <ChevronDown class="ml-auto h-4 w-4 text-muted-foreground" />
    </Select.Trigger>
    <Select.Portal>
        <Select.Content
            sideOffset={8}
            class="z-60 max-h-[var(--bits-select-content-available-height)] min-w-[var(--bits-select-anchor-width)] overflow-y-auto rounded-xl border border-white/10 bg-black/95 p-1.5 text-foreground shadow-2xl backdrop-blur-xl focus:outline-none"
        >
            <Select.Viewport>
                {#each items as item (item.value)}
                    <Select.Item
                        value={item.value}
                        label={item.label}
                        disabled={item.disabled}
                        class="flex h-10 cursor-default select-none items-center rounded-lg px-3 text-sm outline-none data-highlighted:bg-white/10 data-disabled:pointer-events-none data-disabled:opacity-50"
                    >
                        {#snippet children({ selected })}
                            <span>{item.label}</span>
                            {#if selected}
                                <Check class="ml-auto h-4 w-4 text-primary" aria-label="Selected" />
                            {/if}
                        {/snippet}
                    </Select.Item>
                {/each}
            </Select.Viewport>
        </Select.Content>
    </Select.Portal>
</Select.Root>
