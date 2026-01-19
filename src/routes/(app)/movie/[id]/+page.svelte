<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import { ArrowLeft, Play, Calendar, Clock, HardDrive, Film, Folder, Database, Trash2 } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';

  let { data } = $props<{ data: PageData }>();
  let deleting = $state(false);

  function formatFileSize(bytes: number | null): string {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function formatDate(date: Date | null): string {
    if (!date) return 'Unknown';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this movie?')) return;

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
</script>

<div class="min-h-screen bg-background">
    <!-- Hero Section with Backdrop -->
    <div class="relative h-80 md:h-96 overflow-hidden">
        {#if data.movie.backdropUrl || data.movie.posterUrl}
            <img
                src={data.movie.backdropUrl || data.movie.posterUrl}
                alt={data.movie.title}
                class="absolute inset-0 w-full h-full object-cover"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent"></div>
        {:else}
            <div class="absolute inset-0 bg-gradient-to-b from-accent/20 to-background"></div>
        {/if}

        <!-- Back Button -->
        <div class="absolute top-6 left-6 z-10">
            <a href="/">
                <Button variant="ghost" class="bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm">
                    <ArrowLeft class="w-5 h-5 mr-2" />
                    Back
                </Button>
            </a>
        </div>
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
                    />
                {:else}
                    <div class="w-48 md:w-64 aspect-[2/3] rounded-lg bg-accent flex items-center justify-center border border-white/10">
                        <Film class="w-16 h-16 text-muted-foreground" />
                    </div>
                {/if}
            </div>

            <!-- Details -->
            <div class="flex-1 space-y-6">
                <!-- Title & Year -->
                <div>
                    <h1 class="text-3xl md:text-4xl font-bold text-white">{data.movie.title}</h1>
                    {#if data.movie.year}
                        <p class="text-lg text-muted-foreground mt-1">{data.movie.year}</p>
                    {/if}
                </div>

                <!-- Action Buttons -->
                <div class="flex items-center gap-3">
                    <a href="/watch/{data.movie.id}">
                        <Button size="lg" class="px-8">
                            <Play class="w-5 h-5 mr-2 fill-current" />
                            Play Movie
                        </Button>
                    </a>
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
                        <span class="capitalize font-medium {data.movie.status === 'complete' ? 'text-green-400' : data.movie.status === 'downloading' ? 'text-yellow-400' : 'text-muted-foreground'}">{data.movie.status}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">Progress</span>
                        <span class="font-medium">{(data.movie.progress * 100).toFixed(1)}%</span>
                    </div>
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
                        <code class="text-xs bg-accent px-2 py-1 rounded break-all block">{data.movie.filePath || 'Not yet downloaded'}</code>
                    </div>
                    <div>
                        <span class="text-muted-foreground block mb-1">Infohash</span>
                        <code class="text-xs bg-accent px-2 py-1 rounded break-all block">{data.movie.infohash}</code>
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
                        <span class="font-medium">{data.movie.lastPlayedAt ? formatDate(data.movie.lastPlayedAt) : 'Never'}</span>
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
