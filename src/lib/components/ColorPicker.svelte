<script lang="ts">
    import { Check } from '@lucide/svelte';
    import { cn } from '$lib/utils';

    const PROFILE_COLORS = [
        '#E50914',
        '#2563EB',
        '#16A34A',
        '#D97706',
        '#9333EA',
        '#EC4899',
        '#14B8A6',
        '#F97316',
        '#6366F1',
        '#EF4444',
    ];

    let { value = $bindable('#6366F1') }: { value: string } = $props();
</script>

<div class="flex flex-wrap gap-3">
    {#each PROFILE_COLORS as color}
        <button
            type="button"
            class={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center transition-all cursor-pointer',
                value === color ? 'ring-2 ring-white ring-offset-2 ring-offset-background scale-110' : 'hover:scale-110',
            )}
            style="background-color: {color}"
            onclick={() => (value = color)}
            aria-label="Select color {color}"
        >
            {#if value === color}
                <Check class="w-5 h-5 text-white" />
            {/if}
        </button>
    {/each}
</div>
