<script lang="ts">
    import { ChevronDown, Film, Globe, House, LibraryBig, LoaderCircle, Search } from '@lucide/svelte';
    import { goto } from '$app/navigation';
    import DeleteConfirmationModal from '$lib/components/DeleteConfirmationModal.svelte';
    import MediaCard from '$lib/components/MediaCard.svelte';
    import TorrentCard from '$lib/components/TorrentCard.svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import Dialog from '$lib/components/ui/Dialog.svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import { createAddFromBrowseMutation, createResolveTorrentMutation } from '$lib/mutations/browse-mutations';
    import type { BrowseItem } from '$lib/server/tmdb';
    import type { Media } from '$lib/types';
    import { confirmDelete, uiState } from '$lib/ui-state.svelte';

    let query = $state('');
    let searchType = $state<'local' | 'tmdb'>('local');
    let localResults: Media[] = $state([]);
    let tmdbResults: BrowseItem[] = $state([]);
    let searching = $state(false);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let showDropdown = $state(false);

    // Add Media Dialog state
    let magnetInput = $state('');
    let error = $state('');
    let adding = $state(false);
    let deletingId = $state<string | null>(null);
    let resolvingItems = $state<Set<number>>(new Set());
    let addingItems = $state<Set<number>>(new Set());

    // Mutations
    const resolveMutation = createResolveTorrentMutation();
    const addToLibraryMutation = createAddFromBrowseMutation();

    // Promise cache for in-flight torrent resolutions to avoid duplicate requests
    const resolvePromises = new Map<number, Promise<string | null>>();

    async function performSearch() {
        if (query.trim().length < 2) {
            localResults = [];
            tmdbResults = [];
            return;
        }

        searching = true;
        try {
            if (searchType === 'local') {
                const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
                if (res.ok) {
                    localResults = await res.json();
                }
                tmdbResults = [];
            } else {
                const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}`);
                if (res.ok) {
                    const data = await res.json();
                    tmdbResults = data.results || [];
                }
                localResults = [];
            }
        } catch (e) {
            console.error('Search failed:', e);
        } finally {
            searching = false;
        }
    }

    function handleInput() {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(performSearch, 500);
    }

    async function deleteMedia(id: string, event: Event) {
        event.preventDefault();
        event.stopPropagation();

        confirmDelete(
            'Delete Media',
            'Are you sure you want to remove this item? This action cannot be undone.',
            async () => {
                try {
                    deletingId = id;
                    const res = await fetch(`/api/media/${id}`, {
                        method: 'DELETE',
                    });
                    if (res.ok) {
                        localResults = localResults.filter((m: Media) => m.id !== id);
                    }
                } catch (e) {
                    console.error('Failed to delete media:', e);
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
            const res = await fetch('/api/media', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ magnetLink: magnetInput }),
            });
            if (res.ok) {
                magnetInput = '';
                uiState.addMediaDialogOpen = false;
                if (query.trim().length >= 2) {
                    performSearch();
                }
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

    // Get magnet link - either from cache or by resolving via Jackett
    function getMagnetLink(item: BrowseItem): Promise<string | null> {
        if (item.magnetLink) {
            return Promise.resolve(item.magnetLink);
        }

        // Return existing promise if already resolving
        const existing = resolvePromises.get(item.tmdbId);
        if (existing) {
            return existing;
        }

        resolvingItems = new Set(resolvingItems).add(item.tmdbId);

        const promise = (async () => {
            try {
                const result = await resolveMutation.mutateAsync({
                    imdbId: item.imdbId,
                    tmdbId: item.tmdbId,
                    title: item.title,
                });

                if (!(result.success && result.torrent)) {
                    console.error('Failed to resolve torrent:', result.message || result.error);
                    return null;
                }

                return result.torrent.magnetLink;
            } finally {
                const updated = new Set(resolvingItems);
                updated.delete(item.tmdbId);
                resolvingItems = updated;
                // Clean up promise from cache after it settles
                resolvePromises.delete(item.tmdbId);
            }
        })();

        resolvePromises.set(item.tmdbId, promise);
        return promise;
    }

    async function handleAddToLibrary(item: BrowseItem) {
        if (addingItems.has(item.tmdbId)) {
            return;
        }

        // Set adding state immediately to show UI spinner
        addingItems = new Set(addingItems).add(item.tmdbId);

        try {
            const magnetLink = await getMagnetLink(item);
            if (!magnetLink) {
                // If resolution fails, we must clear the adding state
                throw new Error('Could not resolve magnet link');
            }

            await addToLibraryMutation.mutateAsync({
                magnetLink,
                title: item.title,
                year: item.year,
                tmdbId: item.tmdbId,
            });
        } catch (err) {
            console.error('Failed to add to library:', err);
        } finally {
            const updated = new Set(addingItems);
            updated.delete(item.tmdbId);
            addingItems = updated;
        }
    }

    async function handleWatchNow(item: BrowseItem) {
        if (addingItems.has(item.tmdbId)) {
            return;
        }

        // Set adding state immediately to show UI spinner
        addingItems = new Set(addingItems).add(item.tmdbId);

        try {
            const magnetLink = await getMagnetLink(item);
            if (!magnetLink) {
                throw new Error('Could not resolve magnet link');
            }

            const media = await addToLibraryMutation.mutateAsync({
                magnetLink,
                title: item.title,
                year: item.year,
                tmdbId: item.tmdbId,
            });
            goto(`/watch/${media.id}`);
        } catch (err) {
            console.error('Failed to add and watch:', err);
        } finally {
            const updated = new Set(addingItems);
            updated.delete(item.tmdbId);
            addingItems = updated;
        }
    }

    // Prefetch magnet link on hover - runs getMagnetLink in the background
    function handlePrefetch(item: BrowseItem) {
        // Fire and forget - shared promise logic handles deduplication
        getMagnetLink(item);
    }
</script>

<div class="container mx-auto px-4 py-8 min-h-screen">
    <!-- Search Header -->
    <div class="max-w-2xl mx-auto mb-12">
        <h1 class="text-3xl font-bold mb-6 text-center">Search</h1>

        <div class="relative" role="search">
            <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />

            <!-- Search Dropdown -->
            <div class="absolute right-2 top-1/2 -translate-y-1/2 z-1">
                <button
                    type="button"
                    onclick={() => (showDropdown = !showDropdown)}
                    onblur={() => setTimeout(() => (showDropdown = false), 200)}
                    class="flex items-center gap-1 px-3 py-2 rounded-3xl text-sm font-medium bg-card hover:bg-neutral-900 transition-colors cursor-pointer"
                >
                    {#if searchType === "local"}
                        <LibraryBig class="w-4 h-4" />
                        Library
                    {:else}
                        <Globe class="w-4 h-4" />
                        Browse
                    {/if}
                    <ChevronDown class="w-4 h-4" />
                </button>

                {#if showDropdown}
                    <div
                        class="absolute right-0 top-full mt-1 w-40 bg-card rounded-md shadow-lg z-50 border border-border"
                    >
                        <button
                            type="button"
                            onclick={() => {
                                searchType = "local";
                                showDropdown = false;
                                performSearch();
                            }}
                            class="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-accent transition-colors"
                        >
                            <LibraryBig class="w-4 h-4" />
                            Library
                        </button>
                        <button
                            type="button"
                            onclick={() => {
                                searchType = "tmdb";
                                showDropdown = false;
                                performSearch();
                            }}
                            class="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-accent transition-colors"
                        >
                            <Globe class="w-4 h-4" />
                            Browse
                        </button>
                    </div>
                {/if}
            </div>

            <!-- svelte-ignore a11y_autofocus -->
            <input
                type="search"
                bind:value={query}
                oninput={handleInput}
                placeholder={searchType === "local"
                    ? "Search your library..."
                    : "Search torrents..."}
                autocomplete="off"
                autofocus
                class="w-full h-14 rounded-full border border-border bg-card pl-12 pr-24 text-lg outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 transition-all"
            >
        </div>
    </div>

    <!-- Results -->
    {#if searching}
        <div class="flex items-center justify-center p-12">
            <LoaderCircle class="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
    {:else if query.length >= 2 && localResults.length === 0 && tmdbResults.length === 0}
        <div class="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div class="p-4 rounded-full bg-accent/30">
                <Film class="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 class="text-lg font-semibold">No results found</h2>
            <p class="text-muted-foreground">Try a different search term.</p>
        </div>
    {:else if localResults.length > 0}
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {#each localResults as media (media.id)}
                <MediaCard {media} onDelete={deleteMedia} />
            {/each}
        </div>
    {:else if tmdbResults.length > 0}
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {#each tmdbResults as item (item.tmdbId)}
                <TorrentCard
                    {item}
                    onAddToLibrary={handleAddToLibrary}
                    onWatchNow={handleWatchNow}
                    onPrefetch={handlePrefetch}
                    isAdding={addingItems.has(item.tmdbId)}
                    isResolving={resolvingItems.has(item.tmdbId)}
                />
            {/each}
        </div>
    {:else}
        <div class="flex flex-col items-center justify-center p-20 text-center space-y-4 text-muted-foreground">
            <Search class="w-12 h-12 opacity-30" />
            <p>Search your library or torrents</p>
        </div>
    {/if}
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
        {#if error}
            <p class="text-sm text-destructive">{error}</p>
        {/if}
    </div>
    <div class="flex justify-end gap-2">
        <Button variant="ghost" onclick={() => (uiState.addMediaDialogOpen = false)}>Cancel</Button>
        <Button onclick={addMagnet} disabled={adding}>{adding ? "Adding..." : "Add"}</Button>
    </div>
</Dialog>

<DeleteConfirmationModal
    bind:open={uiState.deleteConfirmation.open}
    title={uiState.deleteConfirmation.title}
    description={uiState.deleteConfirmation.description}
    onConfirm={uiState.deleteConfirmation.confirmAction}
    loading={!!deletingId}
/>
