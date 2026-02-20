<script lang="ts">
    import { Lock } from '@lucide/svelte';
    import { cn } from '$lib/utils';

    let {
        name,
        color,
        isMember,
        onclick,
    }: {
        name: string;
        color: string;
        isMember: boolean;
        onclick?: () => void;
    } = $props();

    const initial = $derived(name.charAt(0).toUpperCase());
</script>

<button
    class={cn(
        'flex flex-col items-center gap-3 group transition-transform',
        isMember ? 'hover:scale-105 cursor-pointer' : 'cursor-not-allowed',
    )}
    onclick={isMember ? onclick : undefined}
    disabled={!isMember}
    type="button"
>
    <div
        class={cn(
            'w-24 h-24 md:w-28 md:h-28 rounded-xl flex items-center justify-center text-3xl font-bold text-white transition-all shadow-lg',
            isMember
                ? 'group-hover:ring-2 group-hover:ring-white group-hover:shadow-xl'
                : 'opacity-40 grayscale',
        )}
        style="background-color: {color}"
    >
        {#if !isMember}
            <Lock class="w-8 h-8" />
        {:else}
            {initial}
        {/if}
    </div>
    <span
        class={cn(
            'text-sm font-medium transition-colors',
            isMember ? 'text-gray-300 group-hover:text-white' : 'text-gray-600',
        )}
    >
        {name}
    </span>
</button>
