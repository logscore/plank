<script lang="ts">
  import { Info, Play, Plus, Trash2 } from 'lucide-svelte';
  import DeleteConfirmationModal from '$lib/components/DeleteConfirmationModal.svelte';
  import MovieCard from '$lib/components/MovieCard.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import type { Movie } from '$lib/types';
  import { confirmDelete, uiState } from '$lib/ui-state.svelte';

  let movies: Movie[] = $state([]);
  let loading = $state(true);

  // Add Movie State
  let magnetInput = $state('');
  let adding = $state(false);
  let error = $state('');
  let deletingId = $state<string | null>(null);

  async function loadMovies() {
    try {
      const res = await fetch('/api/movies');
      if (res.ok) {
        movies = await res.json();
      }
    } catch (e) {
      console.error('Failed to load movies:', e);
    } finally {
      loading = false;
    }
  }

  async function addMagnet() {
    if (!magnetInput.trim()) return;

    adding = true;
    error = '';

    try {
      const res = await fetch('/api/movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnetLink: magnetInput }),
      });

      if (res.ok) {
        const movie = await res.json();
        movies = [movie, ...movies]; // Add new movie to top
        magnetInput = '';
        uiState.addMovieDialogOpen = false;
      } else {
        const data = await res.json();
        error = data.message || 'Failed to add movie';
      }
    } catch (e) {
      error = 'Failed to add movie';
    } finally {
      adding = false;
    }
  }

  async function deleteMovie(id: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();

    confirmDelete(
      'Delete Movie',
      'Are you sure you want to remove this movie? This action cannot be undone.',
      async () => {
        try {
          deletingId = id;
          const res = await fetch(`/api/movies/${id}`, { method: 'DELETE' });
          if (res.ok) {
            movies = movies.filter((m) => m.id !== id);
          }
        } catch (e) {
          console.error('Failed to delete movie:', e);
        } finally {
          deletingId = null;
        }
      }
    );
  }

  $effect(() => {
    loadMovies();
  });
</script>

<div class="container mx-auto px-4 py-8">
  {#if loading}
    <div class="flex items-center justify-center p-20">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  {:else if movies.length === 0}
    <div class="flex flex-col items-center justify-center p-20 text-center space-y-4">
      <div class="p-6 rounded-full bg-accent/30">
        <Plus class="w-10 h-10 text-muted-foreground" />
      </div>
      <h3 class="text-xl font-semibold">Your library is empty</h3>
      <p class="text-muted-foreground max-w-sm">Add media using the + button below.</p>
    </div>
  {:else}
    <!-- Grid -->
    <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
      {#each movies as movie (movie.id)}
        <MovieCard {movie} onDelete={deleteMovie} />
      {/each}
    </div>
  {/if}
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
      autofocus
    />
    {#if error}
      <p class="text-sm text-destructive">{error}</p>
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
  loading={!!deletingId}
/>
