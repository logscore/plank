<script lang="ts">
  import { cn } from '$lib/utils';
  import { page } from '$app/stores';
  import { Film, LogOut, Search, Plus } from 'lucide-svelte';
  import { uiState } from '$lib/ui-state.svelte';
  import { fade, fly } from 'svelte/transition';

  let { children, logout } = $props();

  const navItems = [
    { href: '/', icon: Film, label: 'Browse' },
    { href: '/search', icon: Search, label: 'Search' },
  ];
</script>

<div class="min-h-screen bg-background text-foreground flex flex-col relative pb-24">
  <!-- Main Content -->
  <main class="flex-1 relative">
    <div class="absolute inset-0 bg-linear from-background via-background/95 to-background pointer-events-none -z-10"></div>
    {@render children()}
  </main>

  <!-- Bottom Floating Pill Navigation (Hidden on Player) -->
  {#if !$page.url.pathname.startsWith('/watch')}
    <div class="fixed bottom-8 left-1/2 -translate-x-1/2 z-50" transition:fly={{ y: 20, duration: 300 }}>
        <nav class="flex items-center gap-1 p-1.5 rounded-full border border-white/10 bg-black/80 backdrop-blur-xl shadow-2xl">
    
            <!-- Browse & Search -->
            {#each navItems as item}
                {@const isActive = $page.url.pathname === item.href}
                <div class="group relative">
                    <a
                        href={item.href}
                        class={cn(
                            "flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 relative hover:bg-white/10",
                            isActive ? "text-white bg-white/10" : "text-zinc-400 hover:text-white"
                        )}
                        aria-label={item.label}
                    >
                        <item.icon class="w-5 h-5 relative z-10" />
                        {#if isActive}
                            <div class="absolute bottom-2 w-1 h-1 bg-primary rounded-full" transition:fade></div>
                        {/if}
                    </a>
    
                    <!-- Tooltip -->
                    <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 border border-white/10 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                        {item.label}
                    </div>
                </div>
            {/each}
    
            <!-- Divider -->
            <div class="w-px h-8 bg-white/10 mx-1"></div>
    
            <!-- Add Movie -->
            <div class="group relative">
                <button
                    onclick={() => uiState.toggleAddMovieDialog()}
                    class="flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 text-zinc-400 hover:text-white hover:bg-white/10"
                    aria-label="Add Movie"
                >
                    <Plus class="w-6 h-6" />
                </button>
                 <!-- Tooltip -->
                 <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 border border-white/10 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                    Add Movie
                </div>
            </div>
    
        </nav>
      </div>
  {/if}
</div>
