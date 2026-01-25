<script lang="ts">
    import { Film, Tv } from '@lucide/svelte';
    import { createQuery } from '@tanstack/svelte-query';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import MediaCard from '$lib/components/MediaCard.svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import { createDeleteMediaMutation } from '$lib/mutations/media-mutations';
    import { fetchMediaList } from '$lib/queries/media-queries';
    import { queryKeys } from '$lib/query-keys';
    import { confirmDelete } from '$lib/ui-state.svelte';

    // Query hooks for movies and TV shows
    const moviesQuery = createQuery(() => ({
        queryKey: queryKeys.media.list('movie'),
        queryFn: () => fetchMediaList('movie'),
        staleTime: 2 * 60 * 1000, // 2 minutes
    }));

    const showsQuery = createQuery(() => ({
        queryKey: queryKeys.media.list('tv'),
        queryFn: () => fetchMediaList('tv'),
        staleTime: 2 * 60 * 1000, // 2 minutes
    }));

    // Mutation hooks
    const deleteMutation = createDeleteMediaMutation();

    // Reactive derived values from queries
    // In TanStack Svelte Query v6 with Svelte 5, the query returns a reactive object directly
    const movies = $derived(moviesQuery.data ?? []);
    const shows = $derived(showsQuery.data ?? []);
    const loading = $derived(moviesQuery.isLoading || showsQuery.isLoading);
    const queryError = $derived(moviesQuery.error || showsQuery.error);

    // UI State
    const activeTab = $derived((page.url.searchParams.get('type') as 'movies' | 'tv') || 'movies');

    function deleteMedia(id: string, event: Event) {
        event.preventDefault();
        event.stopPropagation();

        confirmDelete(
            'Delete Media',
            'Are you sure you want to remove this? This action cannot be undone.',
            async () => {
                try {
                    await deleteMutation.mutateAsync(id);
                } catch (e) {
                    console.error('Failed to delete media:', e);
                }
            }
        );
    }
</script>

<div class="min-h-screen pb-20 bg-background">
    <!-- Header -->
    <div
        class="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/40 supports-backdrop-filter:bg-background/60"
    >
        <div class="container max-w-7xl mx-auto px-4">
            <!-- Top Bar -->
            <div class="flex items-center justify-between py-3 h-15">
                <h1 class="text-2xl font-semibold tracking-tight">Library</h1>
            </div>

            <!-- Tab Navigation -->
            <div class="flex items-center space-x-2 py-2">
                <Button
                    variant={activeTab === 'movies' ? 'default' : 'ghost'}
                    onclick={() => goto('?type=movies', { replaceState: true, noScroll: true })}
                >
                    <Film class="w-4 h-4 mr-2" />
                    Movies
                    {#if movies.length > 0}
                        <span class="ml-2 text-xs bg-accent px-2 py-0.5 rounded-full text-foreground">
                            {movies.length}
                        </span>
                    {/if}
                </Button>
                <Button
                    variant={activeTab === 'tv' ? 'default' : 'ghost'}
                    onclick={() => goto('?type=tv', { replaceState: true, noScroll: true })}
                >
                    <Tv class="w-4 h-4 mr-2" />
                    TV Shows
                    {#if shows.length > 0}
                        <span class="ml-2 text-xs bg-accent px-2 py-0.5 rounded-full text-foreground">
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
        {:else if queryError}
            <div class="flex flex-col items-center justify-center p-20 text-center space-y-4">
                <p class="text-destructive">Failed to load library: {queryError.message}</p>
                <Button
                    onclick={() => {
						moviesQuery.refetch();
						showsQuery.refetch();
					}}
                >
                    Retry
                </Button>
            </div>
        {:else if activeTab === 'movies'}
            {#if movies.length === 0}
                <div class="flex flex-col items-center justify-center p-20 text-center space-y-4">
                    <div class="p-6 rounded-full bg-accent/30">
                        <Film class="w-10 h-10 text-muted-foreground" />
                    </div>
                    <h2 class="text-xl font-semibold">No movies yet</h2>
                    <p class="text-muted-foreground max-w-sm">Add movies using the + button below.</p>
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
