<script lang="ts">
    import { Lock } from '@lucide/svelte';
    import Facehash from '$lib/components/facehash/Facehash.svelte';
    import { cn } from '$lib/utils';

    let {
        name,
        isMember,
        onclick,
    }: {
        name: string;
        isMember: boolean;
        onclick?: () => void;
    } = $props();
</script>

<button
    class={cn(
        "flex flex-col items-center gap-3 group transition-transform",
        isMember ? " cursor-pointer" : "cursor-not-allowed",
    )}
    onclick={isMember ? onclick : undefined}
    disabled={!isMember}
    type="button"
>
    <div
        class={cn(
            `w-24 h-24 md:w-28 md:h-28 rounded-xl overflow-hidden transition-all shadow-lg`,
            isMember
                ? "group-hover:ring-2 group-hover:ring-white group-hover:shadow-xl"
                : "opacity-40 grayscale",
        )}
    >
        {#if !isMember}
            <div class="w-full h-full flex items-center justify-center bg-zinc-700 text-white">
                <Lock class="w-8 h-8" />
            </div>
        {:else}
            <Facehash {name} size="100%" class="w-full h-full text-white" interactive={true} enableBlink />
        {/if}
    </div>
    <span
        class={cn(
            "text-sm font-medium transition-colors",
            isMember ? "text-gray-300 group-hover:text-white" : "text-gray-600",
        )}
    >
        {name}
    </span>
</button>
