<script lang="ts">
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
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

  function formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond < 1024) return `${bytesPerSecond} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
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
    if (!movie) return;

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
  });

  onDestroy(() => {
    stopProgressPolling();
  });

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
</script>

<div class="min-h-screen bg-black text-white">
  <div class="absolute top-4 left-4 z-10">
    <a href="/" class="flex items-center gap-2 text-zinc-400 hover:text-white transition">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      Back
    </a>
  </div>

  {#if loading}
    <div class="flex items-center justify-center min-h-screen">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
    </div>
  {:else if error}
    <div class="flex items-center justify-center min-h-screen">
      <p class="text-red-400">{error}</p>
    </div>
  {:else}
    <div class="flex flex-col items-center justify-center min-h-screen p-4">
      {#if getIsReady()}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          bind:this={videoElement}
          src={getVideoSrc()}
          controls
          autoplay
          class="max-w-full max-h-[80vh] bg-black rounded-lg"
        ></video>
      {:else}
        <div class="flex flex-col items-center gap-4">
          <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-red-500"></div>
          <p class="text-zinc-400">Buffering video...</p>
        </div>
      {/if}

      <div class="mt-4 flex items-center gap-6 text-sm text-zinc-400">
        {#if progressInfo}
          {#if progressInfo.status === 'complete'}
            <span class="text-green-400">Download complete</span>
          {:else if progressInfo.isActive}
            <span>{(progressInfo.progress * 100).toFixed(1)}% downloaded</span>
            <span>{formatSpeed(progressInfo.downloadSpeed)}</span>
            <span>{progressInfo.peers} peers</span>
          {:else}
            <span class="flex items-center gap-2">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500"></div>
              Connecting to peers...
            </span>
          {/if}
        {/if}
      </div>

      {#if movie}
        <div class="mt-6 max-w-2xl text-center">
          <h1 class="text-2xl font-bold">{movie.title}</h1>
          {#if movie.year}
            <p class="text-zinc-500 mt-1">{movie.year}</p>
          {/if}
          {#if movie.overview}
            <p class="mt-4 text-zinc-400 leading-relaxed">{movie.overview}</p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
