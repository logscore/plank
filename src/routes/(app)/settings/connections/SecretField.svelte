<script lang="ts">
    import { Eye, EyeOff } from "@lucide/svelte";
    import { Toggle } from "bits-ui";
    import Input from "$lib/components/ui/Input.svelte";

    let {
        id,
        name,
        label,
        value = $bindable(),
        placeholder,
        autocomplete = "off",
    }: {
        id: string;
        name: string;
        label: string;
        value: string;
        placeholder?: string;
        autocomplete?: "off" | "current-password";
    } = $props();

    let revealed = $state(false);
</script>

<div>
    <div class="mb-2 flex items-baseline justify-between gap-4">
        <label for={id} class="text-sm font-medium">{label}</label>
        <Toggle.Root
            bind:pressed={revealed}
            aria-label={`${revealed ? "Hide" : "Reveal"} ${label.toLowerCase()}`}
            class="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            {#if revealed}
                <EyeOff class="size-3.5" />
                Hide
            {:else}
                <Eye class="size-3.5" />
                Reveal
            {/if}
        </Toggle.Root>
    </div>
    <Input {id} {name} {autocomplete} type={revealed ? "text" : "password"} bind:value {placeholder} />
</div>
