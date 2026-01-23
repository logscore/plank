<script lang="ts">
    import { Film, Tv } from 'lucide-svelte';
    import DeleteConfirmationModal from '$lib/components/DeleteConfirmationModal.svelte';
    import MediaCard from '$lib/components/MediaCard.svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import Dialog from '$lib/components/ui/Dialog.svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import type { Media, MediaType } from '$lib/types';
    import { confirmDelete, uiState } from '$lib/ui-state.svelte';

    let movies: Media[] = $state([]);
    let shows: Media[] = $state([]);
    let loading = $state(true);
    let activeTab = $state<'movies' | 'tv'>('movies');

    // Add Media State
    let magnetInput = $state('');
    let selectedType = $state<MediaType | null>(null);
    let adding = $state(false);
    let error = $state('');
    let deletingId = $state<string | null>(null);

    async function loadLibrary() {
        loading = true;
        try {
            const [moviesRes, showsRes] = await Promise.all([
                fetch('/api/media?type=movie'),
                fetch('/api/media?type=tv'),
            ]);

            if (moviesRes.ok) {
                movies = await moviesRes.json();
            }
            if (showsRes.ok) {
                shows = await showsRes.json();
            }
        } catch (e) {
            console.error('Failed to load library:', e);
        } finally {
            loading = false;
        }
    }

    async function addMagnet() {
        if (!magnetInput.trim()) {
            return;
        }

        adding = true;
        error = '';

        try {
            const body: { magnetLink: string; type?: MediaType } = {
                magnetLink: magnetInput,
            };
            if (selectedType) {
                body.type = selectedType;
            }

            const res = await fetch('/api/media', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                const mediaItem: Media & { _seasonAdded?: boolean } = await res.json();

                // Check if this was a season addition to an existing show
                if (mediaItem._seasonAdded) {
                    // Don't add duplicate - just close the dialog and switch to TV tab
                    activeTab = 'tv';
                } else if (mediaItem.type === 'tv') {
                    // Add new TV show to list
                    shows = [mediaItem, ...shows];
                    activeTab = 'tv';
                } else {
                    // Add new movie to list
                    movies = [mediaItem, ...movies];
                    activeTab = 'movies';
                }
                magnetInput = '';
                selectedType = null;
                uiState.addMediaDialogOpen = false;
            } else {
                const data = await res.json();
                error = data.message || 'Failed to add media';
            }
        } catch (e) {
            error = 'Failed to add media';
        } finally {
            adding = false;
        }
    }

    async function deleteMedia(id: string, event: Event) {
        event.preventDefault();
        event.stopPropagation();

        confirmDelete(
            'Delete Media',
            'Are you sure you want to remove this? This action cannot be undone.',
            async () => {
                try {
                    deletingId = id;
                    const res = await fetch(`/api/media/${id}`, {
                        method: 'DELETE',
                    });
                    if (res.ok) {
                        movies = movies.filter((m) => m.id !== id);
                        shows = shows.filter((s) => s.id !== id);
                    }
                } catch (e) {
                    console.error('Failed to delete media:', e);
                } finally {
                    deletingId = null;
                }
            }
        );
    }

    $effect(() => {
        loadLibrary();
    });
</script>

<div class="min-h-screen pb-20 bg-background">
    <!-- Header -->
    <div
        class="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/40 supports-backdrop-filter:bg-background/60"
    >
        <div class="container max-w-7xl mx-auto px-4">
            <!-- Top Bar -->
            <div class="flex items-center justify-between py-3 h-15">
                <h1 class="text-xl font-semibold tracking-tight">Library</h1>
            </div>

            <!-- Tab Navigation -->
            <div class="flex items-center space-x-2 py-2">
                <Button
                    variant={activeTab === "movies" ? "default" : "ghost"}
                    onclick={() => (activeTab = "movies")}
                >
                    <Film class="w-4 h-4 mr-2" />
                    Movies
                    {#if movies.length > 0}
                        <span
                            class="ml-2 text-xs bg-accent px-2 py-0.5 rounded-full text-foreground"
                        >
                            {movies.length}
                        </span>
                    {/if}
                </Button>
                <Button
                    variant={activeTab === "tv" ? "default" : "ghost"}
                    onclick={() => (activeTab = "tv")}
                >
                    <Tv class="w-4 h-4 mr-2" />
                    TV Shows
                    {#if shows.length > 0}
                        <span
                            class="ml-2 text-xs bg-accent px-2 py-0.5 rounded-full text-foreground"
                        >
                            {shows.length}
                        </span>
                    {/if}
                </Button>
            </div>
        </div>
    </div>

    <!-- Content -->
    <div class="container max-w-7xl mx-auto px-4 py-8">
        {#if loading}
            <div class="flex items-center justify-center p-20">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        {:else if activeTab === "movies"}
            {#if movies.length === 0}
                <div class="flex flex-col items-center justify-center p-20 text-center space-y-4">
                    <div class="p-6 rounded-full bg-accent/30">
                        <Film class="w-10 h-10 text-muted-foreground" />
                    </div>
                    <h3 class="text-xl font-semibold">No movies yet</h3>
                    <p class="text-muted-foreground max-w-sm">
                        Add movies using the + button below.
                    </p>
                </div>
            {:else}
                <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                    {#each movies as media (media.id)}
                        <MediaCard {media} onDelete={deleteMedia} />
                    {/each}
                </div>
            {/if}
        {:else if shows.length === 0}
            <div class="flex flex-col items-center justify-center p-20 text-center space-y-4">
                <div class="p-6 rounded-full bg-accent/30">
                    <Tv class="w-10 h-10 text-muted-foreground" />
                </div>
                <h3 class="text-xl font-semibold">No TV shows yet</h3>
                <p class="text-muted-foreground max-w-sm">Add TV shows using the + button below.</p>
            </div>
        {:else}
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {#each shows as media (media.id)}
                    <MediaCard {media} onDelete={deleteMedia} />
                {/each}
            </div>
        {/if}
    </div>
</div>

<!-- Add Media Dialog - Controlled by Global Store -->
<Dialog
    bind:open={uiState.addMediaDialogOpen}
    title="Add Media"
    description="Paste a magnet link to start downloading."
>
    <div class="grid gap-4 py-4">
        <Input
            placeholder="magnet:?xt=urn:btih:..."
            bind:value={magnetInput}
            onkeydown={(e) => e.key === "Enter" && addMagnet()}
            autofocus
        />

        <!-- Type selector -->
        <div class="flex gap-2">
            <span class="text-sm text-muted-foreground self-center">Type:</span>
            <Button
                variant={selectedType === null ? "default" : "ghost"}
                size="sm"
                onclick={() => (selectedType = null)}
            >
                Auto-detect
            </Button>
            <Button
                variant={selectedType === "movie" ? "default" : "ghost"}
                size="sm"
                onclick={() => (selectedType = "movie")}
            >
                <Film class="w-3 h-3 mr-1" />
                Movie
            </Button>
            <Button
                variant={selectedType === "tv" ? "default" : "ghost"}
                size="sm"
                onclick={() => (selectedType = "tv")}
            >
                <Tv class="w-3 h-3 mr-1" />
                TV Show
            </Button>
        </div>

        {#if error}
            <p class="text-sm text-destructive">{error}</p>
        {/if}
    </div>
    <div class="flex justify-end gap-2">
        <Button variant="ghost" onclick={() => (uiState.addMediaDialogOpen = false)}>Cancel</Button>
        <Button onclick={addMagnet} disabled={adding}>{adding ? "Adding..." : "Add Media"}</Button>
    </div>
</Dialog>

<DeleteConfirmationModal
    bind:open={uiState.deleteConfirmation.open}
    title={uiState.deleteConfirmation.title}
    description={uiState.deleteConfirmation.description}
    onConfirm={uiState.deleteConfirmation.confirmAction}
    loading={!!deletingId}
/>
