<script lang="ts">
    import { Play } from '@lucide/svelte';
    import type { Media } from '$lib/types';

    let { media } = $props<{ media: Media }>();

    const progress = $derived(
        media.playPosition && media.playDuration && media.playDuration > 0
            ? Math.min((media.playPosition / media.playDuration) * 100, 100)
            : 0
    );

    const link = $derived(media.type === 'tv' ? `/show/${media.id}` : `/watch/${media.id}`);
</script>

<a
    href={link}
    class="relative flex-shrink-0 w-72 aspect-video rounded-lg overflow-hidden group shadow-lg border border-border/50 hover:border-primary/50 transition-all duration-300 hover:scale-[1.03]"
>
    <!-- Backdrop Image -->
    {#if media.backdropUrl}
        <img src={media.backdropUrl} alt={media.title} class="absolute inset-0 w-full h-full object-cover">
    {:else if media.posterUrl}
        <img src={media.posterUrl} alt={media.title} class="absolute inset-0 w-full h-full object-cover blur-sm">
    {:else}
        <div class="absolute inset-0 bg-accent"></div>
    {/if}

    <!-- Gradient Overlay -->
    <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent"></div>

    <!-- Play Icon -->
    <div
        class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
    >
        <div class="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <Play class="w-6 h-6 text-black fill-black ml-0.5" />
        </div>
    </div>

    <!-- Title & Progress -->
    <div class="absolute bottom-0 left-0 right-0 p-3 space-y-2">
        <h3 class="text-sm font-semibold text-white leading-tight truncate">{media.title}</h3>
        {#if progress > 0}
            <div class="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                <div
                    class="h-full bg-primary rounded-full transition-all duration-300"
                    style="width: {progress}%"
                ></div>
            </div>
        {/if}
    </div>
</a>
