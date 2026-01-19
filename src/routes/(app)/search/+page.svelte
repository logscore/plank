<script lang="ts">
  import { Search, Film, Loader2 } from 'lucide-svelte';
  import type { Movie } from '$lib/types';
  import Input from '$lib/components/ui/Input.svelte';
  import MovieCard from '$lib/components/MovieCard.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import DeleteConfirmationModal from '$lib/components/DeleteConfirmationModal.svelte';
  import { uiState, confirmDelete } from '$lib/ui-state.svelte';

  let query = $state('');
  let results: Movie[] = $state([]);
  let searching = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  
  // Add Movie Dialog state
  let magnetInput = $state('');
  let error = $state('');
  let adding = $state(false);

  async function performSearch() {
    if (query.trim().length < 2) {
      results = [];
      return;
    }

    searching = true;
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        results = await res.json();
      }
    } catch (e) {
      console.error('Search failed:', e);
    } finally {
      searching = false;
    }
  }

  function handleInput() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(performSearch, 200);
  }

  let deletingId = $state<string|null>(null);

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
                    results = results.filter(m => m.id !== id);
                }
            } catch (e) {
                console.error('Failed to delete movie:', e);
            } finally {
                deletingId = null;
            }
        }
    );
  }

  async function addMagnet() {
    if (!magnetInput.trim()) {
      error = 'Please enter a magnet link';
      return;
    }
    if (!magnetInput.startsWith('magnet:')) {
      error = 'Invalid magnet link format';
      return;
    }

    error = '';
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
        // Refresh search if there's a query
        if (query.trim().length >= 2) {
          performSearch();
        }
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
</script>

<div class="container mx-auto px-4 py-8 min-h-screen">
    <!-- Search Header -->
    <div class="max-w-2xl mx-auto mb-12">
        <h1 class="text-3xl font-bold mb-6 text-center">Search</h1>
        <div class="relative">
            <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
                type="search"
                bind:value={query}
                oninput={handleInput}
                placeholder="Search your library..."
                autocomplete="off"
                autofocus
                class="w-full h-14 rounded-full border border-border bg-card pl-12 pr-6 text-lg outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 transition-all"
            />
        </div>
    </div>

    <!-- Results -->
    {#if searching}
        <div class="flex items-center justify-center p-12">
            <Loader2 class="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
    {:else if query.length >= 2 && results.length === 0}
        <div class="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div class="p-4 rounded-full bg-accent/30">
                <Film class="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 class="text-lg font-semibold">No results found</h3>
            <p class="text-muted-foreground">Try a different search term.</p>
        </div>
    {:else if results.length > 0}
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {#each results as movie (movie.id)}
                <MovieCard {movie} onDelete={deleteMovie} />
            {/each}
        </div>
    {:else}
        <div class="flex flex-col items-center justify-center p-20 text-center space-y-4 text-muted-foreground">
            <Search class="w-12 h-12 opacity-30" />
            <p>Search your library</p>
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
    <Button onclick={addMagnet} disabled={adding}>
      {adding ? 'Adding...' : 'Add Movie'}
    </Button>
  </div>
</Dialog>

<DeleteConfirmationModal 
    bind:open={uiState.deleteConfirmation.open}
    title={uiState.deleteConfirmation.title}
    description={uiState.deleteConfirmation.description}
    onConfirm={uiState.deleteConfirmation.confirmAction}
    loading={!!deletingId}
/>

