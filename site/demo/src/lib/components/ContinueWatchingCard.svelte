<script lang="ts">
    import { Play } from '@lucide/svelte';
    import type { Media } from '$lib/types';

    let { media } = $props<{ media: Media }>();

    const progress = $derived(
        media.playPosition && media.playDuration && media.playDuration > 0
            ? Math.min((media.playPosition / media.playDuration) * 100, 100)
            : 0
    );

    const link = $derived(media.type === 'show' ? `/show/${media.id}` : `/watch/${media.id}`);
    const imageUrl = $derived(media.backdropUrl ?? media.stillPath ?? media.posterUrl);
</script>

<a
    href={link}
    class="group relative w-92 shrink-0 aspect-video overflow-hidden rounded-lg border border-border/50 shadow-lg transition-all duration-300 hover:scale-[1.03] hover:border-primary/50"
>
    {#if imageUrl}
        <img src={imageUrl} alt={media.title} class="absolute inset-0 h-full w-full object-cover">
    {:else}
        <div class="absolute inset-0 bg-accent"></div>
    {/if}

    <div class="absolute inset-x-0 bottom-0 h-28 bg-linear-to-t from-black via-black/75 to-transparent"></div>

    <div
        class="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100"
    >
        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
            <Play class="ml-0.5 h-6 w-6 fill-black text-black" />
        </div>
    </div>

    <div class="absolute right-0 bottom-0 left-0 space-y-2 p-3">
        <h3 class="truncate text-sm leading-tight font-semibold text-white">{media.title}</h3>
        {#if progress > 0}
            <div class="h-1 w-full overflow-hidden rounded-full bg-white/20">
                <div
                    class="h-full rounded-full bg-primary transition-all duration-300"
                    style="width: {progress}%"
                ></div>
            </div>
        {/if}
    </div>
</a>
