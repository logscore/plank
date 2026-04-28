<script lang="ts">
    import { ArrowLeft, Book, Github } from '@lucide/svelte';
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import Button from '$lib/components/ui/Button.svelte';
    import { demoStore } from '$lib/demo/store.svelte';

    const mediaId = $derived(page.params.id ?? '');
    const media = $derived(demoStore.findMedia(mediaId));

    onMount(() => {
        demoStore.markPlayed(mediaId);
    });
</script>

<div class="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
    {#if media?.backdropUrl}
        <img src={media.backdropUrl} alt={media.title} class="absolute inset-0 h-full w-full object-cover opacity-20">
    {/if}
    <div class="absolute inset-0 bg-background/90 backdrop-blur-sm"></div>

    <div
        class="relative z-10 w-full max-w-2xl rounded-3xl border border-white/10 bg-card/80 p-8 text-center shadow-2xl backdrop-blur-xl"
    >
        <p class="mb-3 text-xs font-medium tracking-[0.3em] text-primary uppercase">Demo Playback</p>
        <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
            {media?.title ?? 'This title'} is not streamable here
        </h1>
        <p class="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
            This is only a demo. No real media files are stored or streamed. To use the real app, go to our docs to spin
            up your own Plank instance
        </p>

        <div class="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a href="/docs" rel="noreferrer"
                ><Button size="lg">
                    <Book class="mr-2 h-4 w-4" />
                    Docs
                </Button></a
            >
            <Button variant="secondary" size="lg" onclick={() => history.length > 1 ? history.back() : goto('/')}>
                <ArrowLeft class="mr-2 h-4 w-4" />
                Back
            </Button>
        </div>
    </div>
</div>
