<script lang="ts">
    import { ArrowLeft, Download, EllipsisVertical, Users } from '@lucide/svelte';
    import { createQuery } from '@tanstack/svelte-query';
    import { onDestroy, onMount } from 'svelte';
    import { page } from '$app/state';
    import Button from '$lib/components/ui/Button.svelte';
    import { createMediaDetailQuery, fetchMediaProgress } from '$lib/queries/media-queries';
    import type { Media } from '$lib/types';

    // Queries
    const mediaQuery = createMediaDetailQuery(page.params.id);
    const media = $derived(mediaQuery.data);
    const loading = $derived(mediaQuery.isLoading);
    const error = $derived(mediaQuery.error ? 'Failed to load media' : '');

    const progressQuery = createQuery(() => ({
        queryKey: ['media', 'progress', page.params.id],
        queryFn: () => fetchMediaProgress(page.params.id),
        enabled: !!media && media.status !== 'complete',
        refetchInterval: (query) => {
            if (query.state.data?.status === 'complete') {
                return false;
            }
            return 1000;
        },
    }));

    const progressInfo = $derived(progressQuery.data);

    let videoElement: HTMLVideoElement | undefined = $state(undefined);
    let showControls = $state(true);
    let controlsTimeout: ReturnType<typeof setTimeout> | null = null;

    // Menu State
    let showMenu = $state(false);
    let showStats = $state(false);

    // Get episodeId from URL for TV episodes
    const episodeId = $derived(page.url.searchParams.get('episodeId'));
    const isTVEpisode = $derived(episodeId !== null);

    function formatSpeed(bytesPerSecond: number): string {
        if (bytesPerSecond < 1024) {
            return `${bytesPerSecond} B/s`;
        }
        if (bytesPerSecond < 1024 * 1024) {
            return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
        }
        return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
    }

    onMount(() => {
        resetControlsTimeout();
        // Close menu on click outside
        document.addEventListener('click', handleGlobalClick);
    });

    onDestroy(() => {
        if (controlsTimeout) {
            clearTimeout(controlsTimeout);
        }
        document.removeEventListener('click', handleGlobalClick);
    });

    function handleGlobalClick(e: MouseEvent) {
        if (showMenu && !(e.target as HTMLElement).closest('#player-menu')) {
            showMenu = false;
        }
    }

    function getVideoSrc(): string {
        if (!media) {
            return '';
        }
        const base = `/api/media/${media.id}/stream`;
        return isTVEpisode ? `${base}?episodeId=${episodeId}` : base;
    }

    function getIsReady(): boolean {
        return (
            progressInfo?.status === 'complete' || (progressInfo?.progress ?? 0) > 0.05 || media?.status === 'complete'
        );
    }

    function handleMouseMove() {
        showControls = true;
        resetControlsTimeout();
    }

    function resetControlsTimeout() {
        if (controlsTimeout) {
            clearTimeout(controlsTimeout);
        }
        controlsTimeout = setTimeout(() => {
            // Hide controls if video is playing and menu is closed
            if (videoElement && !videoElement.paused && !showMenu) {
                showControls = false;
            }
        }, 3000);
    }

    function toggleStats() {
        showStats = !showStats;
        showMenu = false;
    }
</script>

<div
    class="relative w-screen h-screen bg-black overflow-hidden group"
    onmousemove={handleMouseMove}
    role="presentation"
>
    {#if loading}
        <div class="flex items-center justify-center w-full h-full">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
    {:else if error}
        <div class="flex items-center justify-center w-full h-full">
            <div class="text-center">
                <p class="text-destructive text-xl font-bold mb-4">{error}</p>
                <Button variant="secondary" onclick={() => window.history.back()}>Go Back</Button>
            </div>
        </div>
    {:else}
        <!-- Controls Overlay (Top) -->
        <div
            class="absolute top-0 left-0 w-full p-6 z-50 flex justify-between items-start transition-opacity duration-300 {showControls
                ? 'opacity-100'
                : 'opacity-0'}"
        >
            <!-- Back Button -->

            <button
                onclick={() => window.history.back()}
                class="bg-black/50 hover:bg-black/70 text-white rounded-full p-3 backdrop-blur-sm transition-all hover:scale-105"
            >
                <ArrowLeft class="w-6 h-6" />
            </button>

            <!-- Menu Button -->
            <div class="relative" id="player-menu">
                <button
                    onclick={(e) => {
                        e.stopPropagation();
                        showMenu = !showMenu;
                    }}
                    class="bg-black/50 hover:bg-black/70 text-white rounded-full p-3 backdrop-blur-sm transition-all hover:scale-105"
                >
                    <EllipsisVertical class="w-6 h-6" />
                </button>

                <!-- Menu Dropdown -->
                {#if showMenu}
                    <div
                        class="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-black/90 border border-white/10 ring-1 ring-black ring-opacity-5 backdrop-blur-md overflow-hidden"
                    >
                        <div class="py-1" role="menu" aria-orientation="vertical">
                            <button
                                onclick={toggleStats}
                                class="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-white/10 flex items-center justify-between"
                                role="menuitem"
                            >
                                <span>Show Stats</span>
                                {#if showStats}
                                    <div class="w-2 h-2 rounded-full bg-primary"></div>
                                {/if}
                            </button>
                        </div>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Video Player -->
        <div class="w-full h-full flex items-center justify-center">
            {#if getIsReady()}
                <!-- svelte-ignore a11y_media_has_caption -->
                <video
                    bind:this={videoElement}
                    src={getVideoSrc()}
                    controls
                    autoplay
                    class="w-full h-full object-contain"
                    onplay={() => resetControlsTimeout()}
                ></video>
            {:else}
                <div class="relative w-full h-full">
                    <!-- Background Poster blurred -->
                    {#if media?.backdropUrl || media?.posterUrl}
                        <img
                            src={media?.backdropUrl || media?.posterUrl}
                            alt="Background"
                            class="absolute inset-0 w-full h-full object-cover blur-2xl opacity-30"
                        >
                    {/if}
                    <div class="absolute inset-0 flex flex-col items-center justify-center gap-6">
                        <div class="relative">
                            <div class="absolute inset-0 animate-ping rounded-full bg-primary/20"></div>
                            <div
                                class="animate-spin rounded-full h-16 w-16 border-4 border-primary border-t-transparent relative z-10"
                            ></div>
                        </div>
                        <div class="text-center space-y-2">
                            <h2 class="text-2xl font-bold text-white">Buffering {media?.title}...</h2>
                            <p class="text-zinc-400">Waiting for video to stream in from space</p>
                        </div>
                    </div>
                </div>
            {/if}
        </div>

        <!-- Stats Overlay -->
        {#if showStats && progressInfo && progressInfo.status !== "complete"}
            <div
                class="absolute bottom-20 left-6 z-40 p-4 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 text-xs font-mono space-y-2 transition-opacity duration-300 {showControls
                    ? 'opacity-100'
                    : 'opacity-0'}"
            >
                <div class="flex items-center gap-3 text-zinc-300">
                    <Download class="w-4 h-4 text-blue-400" />
                    <span>{formatSpeed(progressInfo.downloadSpeed)}</span>
                </div>
                <div class="flex items-center gap-3 text-zinc-300">
                    <Users class="w-4 h-4 text-green-400" />
                    <span>{progressInfo.peers} peers</span>
                </div>
                <div class="w-48 h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-2">
                    <div
                        class="h-full bg-primary transition-all duration-500 ease-out"
                        style="width: {progressInfo.progress * 100}%"
                    ></div>
                </div>
            </div>
        {/if}
    {/if}
</div>
