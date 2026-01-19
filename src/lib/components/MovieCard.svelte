<script lang="ts">
  import type { Movie } from '$lib/types';
  import { Play, MoreVertical, Trash2, Info } from 'lucide-svelte';
  import Button from './ui/Button.svelte';

  let { movie, onDelete } = $props<{
    movie: Movie;
    onDelete: (id: string, e: Event) => void;
  }>();

  let showMenu = $state(false);

  function handleMenuClick(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    showMenu = !showMenu;
  }

  function handleDelete(e: Event) {
    showMenu = false;
    onDelete(movie.id, e);
  }

  function handleClickOutside(e: MouseEvent) {
    if (showMenu && !(e.target as HTMLElement).closest('.movie-menu')) {
      showMenu = false;
    }
  }
</script>

<svelte:document onclick={handleClickOutside} />

<div
    class="relative aspect-2/3 rounded-lg overflow-hidden group shadow-lg border border-border/50 bg-card hover:scale-[1.02] hover:z-20 hover:border-red-500 transition-all duration-500"
>
    <!-- Poster Image -->
    {#if movie.posterUrl}
        <img
            src={movie.posterUrl}
            alt={movie.title}
            class="w-full h-full object-cover transition-opacity duration-1000 group-hover:opacity-20 group-hover:blur-md"
        />
    {:else}
        <div class="w-full h-full flex items-center justify-center bg-accent text-muted-foreground">
            <span class="text-xs">No Poster</span>
        </div>
    {/if}

    <!-- Details Overlay (Visible on Hover) -->
    <div class="absolute inset-0 p-4 flex flex-col justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/60 backdrop-blur-sm">
        <div class="space-y-2 overflow-hidden flex-1 min-h-0 flex flex-col">
            <h4 class="font-bold text-lg leading-tight text-white shrink-0">{movie.title}</h4>
            <div class="flex items-center justify-between text-xs text-zinc-300 shrink-0">
                <span>{movie.year || ''}</span>
            </div>
            {#if movie.overview}
                <p class="text-xs text-zinc-400 leading-relaxed overflow-y-auto pr-1">
                    {movie.overview}
                </p>
            {/if}
        </div>

        <div class="flex items-center gap-2 pt-2 shrink-0">
            <a href="/watch/{movie.id}" class="flex-1">
                <Button size="sm" class="w-full">
                    <Play class="w-4 h-4 mr-2 fill-current" />
                    Play
                </Button>
            </a>

            <!-- Three-dot Menu -->
            <div class="relative movie-menu">
                <Button
                    variant="ghost"
                    size="icon"
                    class="text-white hover:bg-neutral-800 shrink-0"
                    onclick={handleMenuClick}
                    title="Options"
                >
                    <MoreVertical class="w-4 h-4" />
                </Button>

                <!-- Context Menu Dropdown -->
                {#if showMenu}
                    <div class="absolute right-0 bottom-full mb-2 w-36 rounded-md shadow-lg bg-black/95 border border-white/10 ring-1 ring-black ring-opacity-5 backdrop-blur-md overflow-hidden z-50">
                        <div class="py-1" role="menu">
                            <a
                                href="/movie/{movie.id}"
                                class="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10 flex items-center gap-2"
                                role="menuitem"
                                onclick={() => showMenu = false}
                            >
                                <Info class="w-4 h-4" />
                                Details
                            </a>
                            <button
                                onclick={handleDelete}
                                class="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-white/10 flex items-center gap-2"
                                role="menuitem"
                            >
                                <Trash2 class="w-4 h-4" />
                                Delete
                            </button>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>
