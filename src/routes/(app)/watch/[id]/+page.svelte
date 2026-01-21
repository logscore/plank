<script lang="ts">
  import { ArrowLeft, Download, MoreVertical, Users, Wifi, X } from 'lucide-svelte';
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/stores';
  import Button from '$lib/components/ui/Button.svelte';
  import type { Movie } from '$lib/types';

  interface ProgressInfo {
    status: string;
    progress: number;
    downloadSpeed: number;
    uploadSpeed: number;
    peers: number;
    isActive: boolean;
    filePath: string | null;
  }

  let movie: Movie | null = $state(null);
  let videoElement: HTMLVideoElement | undefined = $state(undefined);
  let progressInfo: ProgressInfo | null = $state(null);
  let loading = $state(true);
  let error = $state('');
  let progressInterval: ReturnType<typeof setInterval> | null = null;
  let showControls = $state(true);
  let controlsTimeout: ReturnType<typeof setTimeout> | null = null;

  // Menu State
  let showMenu = $state(false);
  let showStats = $state(false);

  function formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond < 1024) {
      return `${bytesPerSecond} B/s`;
    }
    if (bytesPerSecond < 1024 * 1024) {
      return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    }
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  }

  async function loadMovie() {
    try {
      const res = await fetch(`/api/movies/${$page.params.id}`);
      if (res.ok) {
        movie = await res.json();
      } else {
        error = 'Movie not found';
      }
    } catch (e) {
      error = 'Failed to load movie';
    } finally {
      loading = false;
    }
  }

  async function fetchProgress() {
    if (!movie) {
      return;
    }

    try {
      const res = await fetch(`/api/movies/${movie.id}/progress`);
      if (res.ok) {
        progressInfo = await res.json();
      }
    } catch (e) {
      console.error('Failed to fetch progress:', e);
    }
  }

  function startProgressPolling() {
    fetchProgress();
    progressInterval = setInterval(fetchProgress, 1000);
  }

  function stopProgressPolling() {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }

  onMount(() => {
    loadMovie();
    resetControlsTimeout();
    // Close menu on click outside
    document.addEventListener('click', handleGlobalClick);
  });

  onDestroy(() => {
    stopProgressPolling();
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

  // Start polling when movie is loaded and not complete
  $effect(() => {
    if (movie && movie.status !== 'complete') {
      startProgressPolling();
    }
    return () => stopProgressPolling();
  });

  // Stop polling when download completes
  $effect(() => {
    if (progressInfo?.status === 'complete') {
      stopProgressPolling();
    }
  });

  function getVideoSrc(): string {
    return movie ? `/api/movies/${movie.id}/stream` : '';
  }

  function getIsReady(): boolean {
    return (
      progressInfo?.status === 'complete' ||
      (progressInfo?.progress ?? 0) > 0.05 ||
      movie?.status === 'complete'
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
        <a href="/">
          <Button variant="secondary">Go Back</Button>
        </a>
      </div>
    </div>
  {:else}
    <!-- Controls Overlay (Top) -->
    <div
      class="absolute top-0 left-0 w-full p-6 z-50 flex justify-between items-start transition-opacity duration-300 {showControls ? 'opacity-100' : 'opacity-0'}"
    >
      <!-- Back Button -->
      <a href="/" class="inline-block">
        <button
          class="bg-black/50 hover:bg-black/70 text-white rounded-full p-3 backdrop-blur-sm transition-all hover:scale-105"
        >
          <ArrowLeft class="w-6 h-6" />
        </button>
      </a>

      <!-- Menu Button -->
      <div class="relative" id="player-menu">
        <button
          onclick={(e) => { e.stopPropagation(); showMenu = !showMenu; }}
          class="bg-black/50 hover:bg-black/70 text-white rounded-full p-3 backdrop-blur-sm transition-all hover:scale-105"
        >
          <MoreVertical class="w-6 h-6" />
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
          {#if movie?.backdropUrl || movie?.posterUrl}
            <img
              src={movie?.backdropUrl || movie?.posterUrl}
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
              <h2 class="text-2xl font-bold text-white">Buffering {movie?.title}...</h2>
              <p class="text-zinc-400">Waiting for movie to stream in from space</p>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Stats Overlay -->
    {#if showStats && progressInfo && progressInfo.status !== 'complete'}
      <div
        class="absolute bottom-20 left-6 z-40 p-4 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 text-xs font-mono space-y-2 transition-opacity duration-300 {showControls ? 'opacity-100' : 'opacity-0'}"
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
