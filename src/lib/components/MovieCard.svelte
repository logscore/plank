<script lang="ts">
  import type { Movie } from '$lib/types';
  import { Play, Trash2, Info } from 'lucide-svelte';
  import Button from './ui/Button.svelte';

  let { movie, onDelete } = $props<{
    movie: Movie;
    onDelete: (id: string, e: Event) => void;
  }>();


</script>

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

            <Button
                variant="ghost"
                size="icon"
                class="text-white hover:bg-neutral-900 shrink-0"
                onclick={(e) => onDelete(movie.id, e)}
                title="Remove"
            >
                <Trash2 class="w-4 h-4" />
            </Button>
        </div>
    </div>
</div>
