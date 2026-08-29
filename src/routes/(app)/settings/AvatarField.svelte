<script lang="ts">
    import Facehash from "$lib/components/facehash/Facehash.svelte";
    import Button from "$lib/components/ui/Button.svelte";

    const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
    const PREVIEW_SIZE = 80;

    let {
        file = $bindable(null),
        currentUrl,
        name,
        changeLabel,
        editable = true,
        disabled = false,
    }: {
        /** The image the user picked but has not saved yet. Set it to null to reset. */
        file?: File | null;
        /** The saved image, or null to fall back to a generated face. */
        currentUrl: string | null;
        /** Seeds the generated face and labels the image. */
        name: string;
        changeLabel: string;
        editable?: boolean;
        disabled?: boolean;
    } = $props();

    let input: HTMLInputElement | undefined = $state();
    let preview = $state<string | null>(null);

    // Hold one object URL per pending file and release it when that file goes away.
    $effect(() => {
        if (!file) {
            preview = null;
            if (input) {
                input.value = "";
            }
            return;
        }

        const url = URL.createObjectURL(file);
        preview = url;
        return () => URL.revokeObjectURL(url);
    });

    function handleChange(event: Event) {
        const target = event.currentTarget as HTMLInputElement;
        file = target.files?.[0] ?? null;
    }
</script>

<div class="flex items-center gap-5">
    {#if preview}
        <img src={preview} alt={`New ${changeLabel}`} class="size-20 shrink-0 rounded-full object-cover">
    {:else if currentUrl}
        <img src={currentUrl} alt={name} class="size-20 shrink-0 rounded-full object-cover">
    {:else}
        <Facehash class="shrink-0 rounded-full" {name} size={PREVIEW_SIZE} intensity3d="medium" />
    {/if}

    {#if editable}
        <div class="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onclick={() => input?.click()} {disabled}>Change {changeLabel}</Button>
            {#if file}
                <Button variant="ghost" size="sm" onclick={() => (file = null)} {disabled}>Remove</Button>
            {/if}
        </div>
        <input type="file" accept={ACCEPT} class="hidden" bind:this={input} onchange={handleChange}>
    {/if}
</div>
