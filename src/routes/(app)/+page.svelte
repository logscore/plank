<script lang="ts">
  import type { Movie } from '$lib/types';
  import { authClient } from '$lib/auth-client';
  import { goto } from '$app/navigation';

  let movies: Movie[] = $state([]);
  let loading = $state(true);
  let magnetInput = $state('');
  let adding = $state(false);
  let error = $state('');

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
        movies = [movie, ...movies];
        magnetInput = '';
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

    if (!confirm('Are you sure you want to remove this movie?')) return;

    try {
      const res = await fetch(`/api/movies/${id}`, { method: 'DELETE' });
      if (res.ok) {
        movies = movies.filter(m => m.id !== id);
      }
    } catch (e) {
      console.error('Failed to delete movie:', e);
    }
  }

  async function handleLogout() {
    await authClient.signOut();
    goto('/login');
  }

  $effect(() => {
    loadMovies();
  });
</script>

<div class="min-h-screen bg-zinc-950 text-white">
  <header class="p-6 border-b border-zinc-800">
    <div class="max-w-6xl mx-auto flex items-center justify-between">
      <h1 class="text-2xl font-bold text-red-500">Plank</h1>
      <div class="flex items-center gap-4">
        <div class="flex gap-2">
          <input
            type="text"
            bind:value={magnetInput}
            placeholder="Paste magnet link..."
            class="w-96 px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:border-red-500"
            onkeydown={(e) => e.key === 'Enter' && addMagnet()}
          />
          <button
            onclick={addMagnet}
            disabled={adding}
            class="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 transition"
          >
            {adding ? 'Adding...' : 'Add'}
          </button>
        </div>
        <button
          onclick={handleLogout}
          class="px-3 py-2 text-zinc-400 hover:text-white transition"
        >
          Logout
        </button>
      </div>
    </div>
  </header>

  {#if error}
    <div class="max-w-6xl mx-auto px-6 pt-4">
      <div class="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
        {error}
      </div>
    </div>
  {/if}

  <main class="max-w-6xl mx-auto p-6">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
      </div>
    {:else if movies.length === 0}
      <div class="text-center py-20">
        <p class="text-zinc-400 text-lg">No movies yet.</p>
        <p class="text-zinc-500 mt-2">Add a magnet link to get started.</p>
      </div>
    {:else}
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {#each movies as movie (movie.id)}
          <a href="/watch/{movie.id}" class="group relative">
            <div class="aspect-[2/3] bg-zinc-800 rounded-lg overflow-hidden">
              {#if movie.posterUrl}
                <img
                  src={movie.posterUrl}
                  alt={movie.title}
                  class="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
              {:else}
                <div class="w-full h-full flex items-center justify-center text-zinc-600">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                  </svg>
                </div>
              {/if}

            </div>

            <button
              onclick={(e) => deleteMovie(movie.id, e)}
              aria-label="Remove movie"
              class="absolute top-2 right-2 p-1.5 bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition hover:bg-red-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <p class="mt-2 text-sm truncate">{movie.title}</p>
            {#if movie.year}
              <p class="text-xs text-zinc-500">{movie.year}</p>
            {/if}
          </a>
        {/each}
      </div>
    {/if}
  </main>
</div>
