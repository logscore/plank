<script lang="ts">
    import 'vidstack/player/styles/default/theme.css';
    import 'vidstack/player/styles/default/layouts/video.css';
    import 'vidstack/player';
    import 'vidstack/player/layouts';
    import 'vidstack/player/ui';
    import { ArrowLeft, Download, EllipsisVertical, Users } from '@lucide/svelte';
    import { createQuery } from '@tanstack/svelte-query';
    import { onDestroy, onMount } from 'svelte';
    import type { MediaPlayerElement } from 'vidstack/elements';
    import { browser } from '$app/environment';
    import { page } from '$app/state';
    import Button from '$lib/components/ui/Button.svelte';
    import { createSavePositionMutation } from '$lib/mutations/media-mutations';
    import {
        createMediaDetailQuery,
        fetchMediaProgress,
        fetchPlayPosition,
        fetchSubtitleTracks,
        type SubtitleTrackResponse,
    } from '$lib/queries/media-queries';

    // Queries
    const mediaQuery = createMediaDetailQuery(page.params.id ?? '');
    const media = $derived(mediaQuery.data);
    const loading = $derived(mediaQuery.isLoading);
    const error = $derived(mediaQuery.error ? 'Failed to load media' : '');

    const progressQuery = createQuery(() => ({
        queryKey: ['media', 'progress', page.params.id],
        queryFn: () => fetchMediaProgress(page.params.id ?? ''),
        enabled: !!media && media.status !== 'complete',
        refetchInterval: (query) => {
            if (query.state.data?.status === 'complete') {
                return false;
            }
            return 1000;
        },
    }));

    const progressInfo = $derived(progressQuery.data);

    // Get episodeId from URL for TV episodes
    const episodeId = $derived(page.url.searchParams.get('episodeId'));
    const isTVEpisode = $derived(episodeId !== null);

    // Player state
    let playerEl: MediaPlayerElement | undefined = $state(undefined);
    let showOverlay = $state(true);

    // Menu state
    let showMenu = $state(false);
    let showStats = $state(false);

    // Play position state
    let initialPosition: number | null = $state(null);
    let positionRestored = $state(false);
    const savePositionMutation = createSavePositionMutation();
    let lastSaveTime = 0;
    const SAVE_INTERVAL_MS = 5000;

    // Subtitle state
    let subtitleTracks: SubtitleTrackResponse[] = $state([]);

    function formatSpeed(bytesPerSecond: number): string {
        if (bytesPerSecond < 1024) {
            return `${bytesPerSecond} B/s`;
        }
        if (bytesPerSecond < 1024 * 1024) {
            return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
        }
        return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
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

    // Sync custom overlay with vidstack controls visibility
    function onControlsChange(event: Event) {
        const visible = (event as CustomEvent).detail;
        if (showMenu) {
            return;
        }
        showOverlay = visible;
    }

    function toggleStats() {
        showStats = !showStats;
        showMenu = false;
    }

    function handleGlobalClick(e: MouseEvent) {
        if (showMenu && !(e.target as HTMLElement).closest('#player-menu')) {
            showMenu = false;
        }
    }

    // Play position: save current time
    function savePosition(currentTime: number, duration?: number) {
        const id = page.params.id;
        if (!id || currentTime <= 0) {
            return;
        }

        savePositionMutation.mutate({
            id,
            position: currentTime,
            duration,
            episodeId: episodeId ?? undefined,
        });
    }

    // Player event handlers
    function onCanPlay() {
        if (!positionRestored && initialPosition && initialPosition > 0 && playerEl) {
            playerEl.currentTime = initialPosition;
            positionRestored = true;
        }
    }

    function onTimeUpdate() {
        const now = Date.now();
        if (now - lastSaveTime < SAVE_INTERVAL_MS) {
            return;
        }
        lastSaveTime = now;

        const currentTime = playerEl?.currentTime ?? 0;
        const duration = playerEl?.duration;
        if (currentTime > 0) {
            savePosition(currentTime, duration);
        }
    }

    function onEnded() {
        const duration = playerEl?.duration;
        if (duration) {
            savePosition(duration, duration);
        }
    }

    // Lifecycle: attach player event listeners
    $effect(() => {
        if (!playerEl) {
            return;
        }

        const el = playerEl;
        el.addEventListener('can-play', onCanPlay);
        el.addEventListener('time-update', onTimeUpdate);
        el.addEventListener('ended', onEnded);
        el.addEventListener('controls-change', onControlsChange);

        return () => {
            el.removeEventListener('can-play', onCanPlay);
            el.removeEventListener('time-update', onTimeUpdate);
            el.removeEventListener('ended', onEnded);
            el.removeEventListener('controls-change', onControlsChange);
        };
    });

    onMount(async () => {
        document.addEventListener('click', handleGlobalClick);

        const mediaId = page.params.id;
        if (!mediaId) {
            return;
        }

        // Fetch initial position and subtitle tracks in parallel
        const [posResult, subsResult] = await Promise.allSettled([
            fetchPlayPosition(mediaId, episodeId ?? undefined),
            fetchSubtitleTracks(mediaId, episodeId ?? undefined),
        ]);

        if (posResult.status === 'fulfilled' && posResult.value.position > 0) {
            initialPosition = posResult.value.position;
        }

        if (subsResult.status === 'fulfilled') {
            subtitleTracks = subsResult.value;
        }
    });

    onDestroy(() => {
        if (browser) {
            document.removeEventListener('click', handleGlobalClick);

            // Save final position via sendBeacon on page leave
            const id = page.params.id;
            if (id && playerEl) {
                const currentTime = playerEl.currentTime;
                const duration = playerEl.duration;
                if (currentTime > 0) {
                    const payload = JSON.stringify({
                        position: currentTime,
                        duration,
                        episodeId: episodeId ?? undefined,
                    });
                    navigator.sendBeacon(`/api/media/${id}/position`, payload);
                }
            }
        }
    });
</script>

<div class="relative w-screen h-screen bg-black overflow-hidden group" role="presentation">
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
            class="absolute top-0 left-0 w-full p-6 z-50 flex justify-between items-start transition-opacity duration-300 {showOverlay
                ? 'opacity-100'
                : 'opacity-0 pointer-events-none'}"
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
        <div class="w-full h-full">
            {#if getIsReady()}
                <media-player
                    bind:this={playerEl}
                    src={getVideoSrc()}
                    autoplay
                    playsinline
                    streamType="on-demand"
                    controlsDelay={3000}
                    title={media?.title ?? ""}
                    class="player dark"
                >
                    <media-provider>
                        {#each subtitleTracks as track (track.id)}
                            <track
                                src={track.src}
                                kind="subtitles"
                                label={track.label}
                                srclang={track.language}
                                default={track.isDefault}
                            >
                        {/each}
                    </media-provider>
                    <media-video-layout></media-video-layout>
                </media-player>
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
                            <h2 class="text-2xl font-bold text-white">Loading {media?.title}...</h2>
                            <p class="text-zinc-400">Waiting for video to stream in from space</p>
                        </div>
                    </div>
                </div>
            {/if}
        </div>

        <!-- Stats Overlay -->
        {#if showStats && progressInfo && progressInfo.status !== "complete"}
            <div
                class="absolute bottom-20 left-6 z-40 p-4 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 text-xs font-mono space-y-2 transition-opacity duration-300 {showOverlay
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

<style>
    /* Player sizing — fullscreen-style, no border/radius */
    .player {
        display: block;
        width: 100%;
        height: 100%;

        --video-brand: hsl(0 84% 60%);
        --video-border: none;
        --video-border-radius: 0;
        --video-bg: black;
        --video-focus-ring-color: hsl(0 84% 60%);
        --video-controls-color: #f5f5f5;
        --media-font-family: "Outfit", ui-sans-serif, system-ui, sans-serif;

        /* Match overlay fade: 300ms transition, synced with back button */
        --media-controls-in-transition: opacity 0.3s ease-in;
        --media-controls-out-transition: opacity 0.3s ease-out;

        /* Slightly larger buttons for a cinematic feel */
        --media-button-border-radius: 9999px;
        --media-button-hover-bg: rgb(255 255 255 / 0.15);

        /* Slider/progress bar in brand red */
        --media-slider-track-fill-bg: hsl(0 84% 60%);
        --media-slider-track-bg: rgb(255 255 255 / 0.2);

        /* Tooltip styling to match glassmorphism */
        --media-tooltip-bg-color: rgb(0 0 0 / 0.85);
        --media-tooltip-border: 1px solid rgb(255 255 255 / 0.1);
        --media-tooltip-color: #f5f5f5;

        /* Menu styling */
        --media-menu-bg: rgb(10 10 10 / 0.95);
        --media-menu-border: 1px solid rgb(255 255 255 / 0.1);

        /* Buffering spinner in brand red */
        --media-buffering-track-fill-color: hsl(0 84% 60%);
    }
</style>
