<script lang="ts">
  import {
    ArrowLeft,
    Calendar,
    Check,
    Copy,
    Database,
    Film,
    Folder,
    Play,
    RotateCcw,
    Trash2,
  } from 'lucide-svelte';
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import DeleteConfirmationModal from '$lib/components/DeleteConfirmationModal.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import { confirmDelete, uiState } from '$lib/ui-state.svelte';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  let deleting = $state(false);
  let retrying = $state(false);
  let copied = $state(false);

  // Add Movie Dialog state
  let magnetInput = $state('');
  let magnetError = $state('');
  let adding = $state(false);

  // Live stats (updated via SSE)
  let liveStatus = $state<string | null>(null);
  let liveProgress = $state<number | null>(null);
  let downloadSpeed = $state(0);
  let peers = $state(0);

  // Sync initial values from data when component mounts or data changes
  $effect(() => {
    liveStatus = data.movie.status;
    liveProgress = data.movie.progress;
  });

  function formatFileSize(bytes: number | null): string {
    if (!bytes) {
      return 'Unknown';
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond < 1024) {
      return `${bytesPerSecond} B/s`;
    }
    if (bytesPerSecond < 1024 * 1024) {
      return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    }
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  }

  function formatDate(date: Date | null): string {
    if (!date) {
      return 'Unknown';
    }
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async function copyFilePath() {
    if (!data.movie.filePath) {
      return;
    }
    try {
      await navigator.clipboard.writeText(data.movie.filePath);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }

  let eventSource: EventSource | null = null;

  function startStream() {
    if (eventSource) {
      return;
    }

    eventSource = new EventSource(`/api/movies/${data.movie.id}/progress/stream`);

    eventSource.onmessage = (event) => {
      try {
        const info = JSON.parse(event.data);
        liveStatus = info.status;
        liveProgress = info.progress;
        downloadSpeed = info.downloadSpeed || 0;
        peers = info.peers || 0;

        // SSE will auto-close when complete, but we stop listening too
        if (info.status === 'complete') {
          stopStream();
        }
      } catch (e) {
        console.error('Failed to parse SSE data:', e);
      }
    };

    eventSource.onerror = () => {
      // Connection closed or error - stop listening
      stopStream();
    };
  }

  function getColorForCertification(cert: string | null): string {
    if (!cert) {
      return 'border-white/30 text-white';
    }
    switch (cert.toUpperCase()) {
      case 'G':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'PG':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'PG-13':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'R':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'NC-17':
        return 'bg-red-900/20 text-red-600 border-red-900/30';
      default:
        return 'border-white/30 text-white';
    }
  }

  function stopStream() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  }

  onMount(() => {
    // Only stream if not complete
    if (data.movie.status !== 'complete') {
      startStream();
    }
  });

  onDestroy(() => {
    stopStream();
  });

  async function handleRetry() {
    retrying = true;
    try {
      const res = await fetch(`/api/movies/${data.movie.id}/retry`, { method: 'POST' });
      if (res.ok) {
        liveStatus = 'added';
        liveProgress = 0;
        startStream();
      }
    } catch (e) {
      console.error('Failed to retry download:', e);
    } finally {
      retrying = false;
    }
  }

  async function addMagnet() {
    if (!magnetInput.trim()) {
      magnetError = 'Please enter a magnet link';
      return;
    }
    if (!magnetInput.startsWith('magnet:')) {
      magnetError = 'Invalid magnet link format';
      return;
    }

    magnetError = '';
    adding = true;
    try {
      const res = await fetch('/api/movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnetLink: magnetInput }),
      });
      if (res.ok) {
        magnetInput = '';
        uiState.addMovieDialogOpen = false;
      } else {
        const data = await res.json();
        magnetError = data.message || 'Failed to add movie';
      }
    } catch (e) {
      magnetError = 'Failed to add movie';
    } finally {
      adding = false;
    }
  }

  async function handleDelete() {
    confirmDelete(
      'Delete Movie',
      'Are you sure you want to delete this movie? This action cannot be undone.',
      async () => {
        deleting = true;
        try {
          const res = await fetch(`/api/movies/${data.movie.id}`, { method: 'DELETE' });
          if (res.ok) {
            goto('/');
          }
        } catch (e) {
          console.error('Failed to delete movie:', e);
        } finally {
          deleting = false;
        }
      }
    );
  }
</script>

<div class="min-h-screen bg-background">
  <!-- Hero Section with Backdrop -->
  <div class="relative h-80 md:h-96 overflow-hidden">
    {#if data.movie.backdropUrl || data.movie.posterUrl}
      <img
        src={data.movie.backdropUrl || data.movie.posterUrl}
        alt={data.movie.title}
        class="absolute inset-0 w-full h-full object-cover"
      >
      <div
        class="absolute inset-0 bg-linear-to-t from-background via-background/80 to-transparent"
      ></div>
    {:else}
      <div class="absolute inset-0 bg-linear-to-b from-accent/20 to-background"></div>
    {/if}

    <!-- Back Button -->
    <div class="fixed top-6 left-6 z-50"><a href="/">
      <Button variant="ghost" class="bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm">
        <ArrowLeft class="w-5 h-5 mr-2" />
        Back
      </Button>
    </a></div>
  </div>

  <!-- Content -->
  <div class="container mx-auto px-4 -mt-40 relative z-10">
    <div class="flex flex-col md:flex-row gap-8">
      <!-- Poster -->
      <div class="shrink-0">
        {#if data.movie.posterUrl}
          <img
            src={data.movie.posterUrl}
            alt={data.movie.title}
            class="w-48 md:w-64 rounded-lg shadow-2xl border border-white/10"
          >
        {:else}
          <div
            class="w-48 md:w-64 aspect-2/3 rounded-lg bg-accent flex items-center justify-center border border-white/10"
          >
            <Film class="w-16 h-16 text-muted-foreground" />
          </div>
        {/if}
      </div>

      <!-- Details -->
      <div class="flex-1 space-y-6">
        <!-- Title -->
        <div>
          <h1 class="text-3xl md:text-4xl font-bold text-white">{data.movie.title}</h1>
        </div>

        <!-- Meta Badges -->
        <div class="flex flex-wrap items-center gap-3 text-sm">
          {#if data.movie.certification}
            <span
              class="px-3 py-1 rounded-full border font-bold {getColorForCertification(data.movie.certification)}"
            >
              {data.movie.certification}
            </span>
          {/if}
          {#if data.movie.year}
            <span class="px-3 py-1 rounded-full bg-accent text-muted-foreground"
              >{data.movie.year}</span
            >
          {/if}
          {#if data.movie.runtime}
            <span class="px-3 py-1 rounded-full bg-accent text-muted-foreground">
              {Math.floor(data.movie.runtime / 60)}h {data.movie.runtime % 60}m
            </span>
          {/if}
          {#if data.movie.originalLanguage}
            <span class="px-3 py-1 rounded-full bg-accent text-muted-foreground uppercase">
              {data.movie.originalLanguage}
            </span>
          {/if}
        </div>

        <!-- Genres -->
        {#if data.movie.genres}
          {@const genreList = JSON.parse(data.movie.genres) as string[]}
          <div class="flex flex-wrap gap-2">
            {#each genreList as genre}
              <span
                class="px-3 py-1 rounded-full border border-white/20 text-sm text-muted-foreground"
                >{genre}</span
              >
            {/each}
          </div>
        {/if}

        <!-- Action Buttons -->
        <div class="flex items-center gap-3">
          {#if liveStatus === 'error'}
            <Button
              size="lg"
              class="px-8 bg-yellow-600 hover:bg-yellow-500"
              onclick={handleRetry}
              disabled={retrying}
            >
              <RotateCcw class="w-5 h-5 mr-2" />
              {retrying ? 'Retrying...' : 'Retry Download'}
            </Button>
          {:else}
            <a href="/watch/{data.movie.id}">
              <Button size="lg" class="px-8">
                <Play class="w-5 h-5 mr-2 fill-current" />
                Play Movie
              </Button>
            </a>
          {/if}
          <Button
            variant="ghost"
            size="lg"
            class="text-white  hover:bg-neutral-800"
            onclick={handleDelete}
            disabled={deleting}
          >
            <Trash2 class="w-5 h-5 mr-2" />
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>

        <!-- Overview -->
        {#if data.movie.overview}
          <div class="ml-2">
            <h2 class="text-lg font-semibold text-white mb-1 mt-4">Overview</h2>
            <p class="text-muted-foreground leading-relaxed">{data.movie.overview}</p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Technical Details -->
    <div class="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
      <div class="bg-card border border-border rounded-lg p-6 space-y-4">
        <h3 class="text-lg font-semibold flex items-center gap-2">
          <Database class="w-5 h-5 text-primary" />
          File Information
        </h3>
        <div class="space-y-3 text-sm">
          <div class="flex justify-between">
            <span class="text-muted-foreground">Status</span>
            <span
              class="capitalize font-medium {liveStatus === 'complete' ? 'text-green-400' : liveStatus === 'downloading' ? 'text-yellow-400' : 'text-muted-foreground'}"
              >{liveStatus}</span
            >
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Progress</span>
            <span class="font-medium">{(liveProgress * 100).toFixed(1)}%</span>
          </div>
          {#if liveStatus === 'downloading'}
            <div class="flex justify-between">
              <span class="text-muted-foreground">Download Speed</span>
              <span class="font-medium text-blue-400">{formatSpeed(downloadSpeed)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Peers</span>
              <span class="font-medium text-green-400">{peers}</span>
            </div>
          {/if}
          <div class="flex justify-between">
            <span class="text-muted-foreground">File Size</span>
            <span class="font-medium">{formatFileSize(data.movie.fileSize)}</span>
          </div>
        </div>
      </div>

      <div class="bg-card border border-border rounded-lg p-6 space-y-4">
        <h3 class="text-lg font-semibold flex items-center gap-2">
          <Folder class="w-5 h-5 text-primary" />
          Storage
        </h3>
        <div class="space-y-3 text-sm">
          <div>
            <span class="text-muted-foreground block mb-1">File Path</span>
            <div class="flex items-center gap-2 relative overflow-hidden group">
              <div class="relative flex-1 overflow-hidden">
                <code
                  class="text-xs bg-accent px-2 py-1 rounded whitespace-nowrap overflow-x-auto block w-full no-scrollbar pr-6"
                >
                  {data.movie.filePath || 'Not yet downloaded'}
                </code>
                <!-- Fade/Blur effect on the right -->
                <div
                  class="absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-l from-accent to-transparent pointer-events-none"
                ></div>
              </div>
              {#if data.movie.filePath}
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6 shrink-0 bg-background/50 backdrop-blur-sm"
                  onclick={copyFilePath}
                >
                  {#if copied}
                    <Check class="h-3 w-3 text-green-500" />
                  {:else}
                    <Copy class="h-3 w-3" />
                  {/if}
                </Button>
              {/if}
            </div>
          </div>
          <div>
            <span class="text-muted-foreground block mb-1">Infohash</span>
            <code class="text-xs bg-accent px-2 py-1 rounded break-all block">
              {data.movie.infohash}
            </code>
          </div>
        </div>
      </div>

      <div class="bg-card border border-border rounded-lg p-6 space-y-4">
        <h3 class="text-lg font-semibold flex items-center gap-2">
          <Calendar class="w-5 h-5 text-primary" />
          Dates
        </h3>
        <div class="space-y-3 text-sm">
          <div class="flex justify-between">
            <span class="text-muted-foreground">Added</span>
            <span class="font-medium">{formatDate(data.movie.addedAt)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Last Played</span>
            <span class="font-medium"
              >{data.movie.lastPlayedAt ? formatDate(data.movie.lastPlayedAt) : 'Never'}</span
            >
          </div>
        </div>
      </div>

      <div class="bg-card border border-border rounded-lg p-6 space-y-4">
        <h3 class="text-lg font-semibold flex items-center gap-2">
          <Film class="w-5 h-5 text-primary" />
          Metadata
        </h3>
        <div class="space-y-3 text-sm">
          <div class="flex justify-between">
            <span class="text-muted-foreground">TMDB ID</span>
            <span class="font-medium">{data.movie.tmdbId || 'Not linked'}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Movie ID</span>
            <code class="text-xs bg-accent px-2 py-1 rounded">{data.movie.id}</code>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Add Movie Dialog - Controlled by Global Store -->
<Dialog
  bind:open={uiState.addMovieDialogOpen}
  title="Add Movie"
  description="Paste a magnet link to start downloading."
>
  <div class="grid gap-4 py-4">
    <Input
      placeholder="magnet:?xt=urn:btih:..."
      bind:value={magnetInput}
      onkeydown={(e) => e.key === 'Enter' && addMagnet()}
    />
    {#if magnetError}
      <p class="text-sm text-destructive">{magnetError}</p>
    {/if}
  </div>
  <div class="flex justify-end gap-2">
    <Button variant="ghost" onclick={() => uiState.addMovieDialogOpen = false}>Cancel</Button>
    <Button onclick={addMagnet} disabled={adding}>{adding ? 'Adding...' : 'Add Movie'}</Button>
  </div>
</Dialog>

<DeleteConfirmationModal
  bind:open={uiState.deleteConfirmation.open}
  title={uiState.deleteConfirmation.title}
  description={uiState.deleteConfirmation.description}
  onConfirm={uiState.deleteConfirmation.confirmAction}
  loading={deleting}
/>
