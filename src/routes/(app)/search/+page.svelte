<script lang="ts">
    import { Clock, Film, LoaderCircle, Search } from "@lucide/svelte";
    import { onDestroy, untrack } from "svelte";
    import { goto } from "$app/navigation";
    import CatalogFilterButton from "$lib/components/CatalogFilterButton.svelte";
    import MediaCard from "$lib/components/MediaCard.svelte";
    import TorrentCard from "$lib/components/TorrentCard.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import Dialog from "$lib/components/ui/Dialog.svelte";
    import Input from "$lib/components/ui/Input.svelte";
    import {
        type BrowseItem,
        createAddFromBrowseMutation,
        fetchSeasonsCached,
        resolveTorrentCached,
        type SeasonSummary,
    } from "$lib/data/browse";
    import { createAddMediaMutation, createDeleteMediaMutation } from "$lib/data/media";
    import {
        type CatalogFilters,
        type CatalogSearchJsonResponse,
        type CatalogSearchResponse,
        fromCatalogSearchJson,
        type SearchScope,
        serializeCatalogSearch,
    } from "$lib/data/search";
    import { searchHistory } from "$lib/search-history.svelte";
    import type { CatalogSeason, Media, SeasonWithEpisodes } from "$lib/types";
    import { confirmDelete, uiState } from "$lib/ui-state.svelte";
    import type { PageData } from "./$types";

    let { data } = $props<{ data: PageData }>();
    let query = $state(untrack(() => data.request.query));
    let filters = $state<CatalogFilters>(
        untrack(() => ({ ...data.request.filters, genres: [...data.request.filters.genres] }))
    );
    let response = $state<CatalogSearchResponse>(untrack(() => data.response));
    // The query this page last sent to the server. It keeps an in-flight search
    // from overwriting characters typed while the results were loading.
    let syncedQuery = untrack(() => data.request.query);
    let searching = $state(false);
    let loadingMore = $state(false);
    let loadMoreController: AbortController | null = null;

    let historyOpen = $state(false);
    const historyMatches = $derived.by(() => {
        const needle = query.trim().toLowerCase();
        return searchHistory.entries.filter(
            (entry) => entry.toLowerCase() !== needle && entry.toLowerCase().includes(needle)
        );
    });

    let magnetInput = $state("");
    let error = $state("");
    let adding = $state(false);
    let resolvingItems = $state<Set<number>>(new Set());
    let addingItems = $state<Set<number>>(new Set());
    let seasonsCache = $state<Map<number, CatalogSeason[]>>(new Map());
    let seasonsLoading = $state<Set<number>>(new Set());

    const addMediaMutation = createAddMediaMutation();
    const deleteMediaMutation = createDeleteMediaMutation();
    const addToLibraryMutation = createAddFromBrowseMutation();

    $effect(() => {
        const incomingQuery = data.request.query;
        if (incomingQuery !== syncedQuery) {
            syncedQuery = incomingQuery;
            query = incomingQuery;
        }
        filters = { ...data.request.filters, genres: [...data.request.filters.genres] };
        response = data.response;
    });

    function getSearchPlaceholder(scope: SearchScope): string {
        switch (scope) {
            case "library":
                return "Search your library";
            case "catalog":
                return "Search the catalog";
            default:
                return "Search all titles";
        }
    }

    function getResponseItemCount(currentResponse: CatalogSearchResponse): number {
        if (currentResponse.scope === "all") {
            return currentResponse.libraryItems.length + currentResponse.catalogItems.length;
        }
        return currentResponse.items.length;
    }

    async function performSearch(nextFilters: CatalogFilters = filters) {
        loadMoreController?.abort();
        loadMoreController = null;
        loadingMore = false;
        filters = { ...nextFilters, genres: [...nextFilters.genres] };
        syncedQuery = query.trim();
        const params = serializeCatalogSearch({
            query: syncedQuery,
            page: 1,
            filters,
        });
        searching = true;
        try {
            await goto(`?${params}`, {
                keepFocus: true,
                noScroll: true,
                replaceState: true,
            });
        } catch (cause) {
            console.error("Search failed:", cause);
        } finally {
            searching = false;
        }
    }

    async function handleSearchKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            historyOpen = false;
            return;
        }
        if (event.key === "Enter") {
            historyOpen = false;
            searchHistory.record(query);
            await performSearch();
        }
    }

    function handleSearchFocusOut(event: FocusEvent) {
        const container = event.currentTarget as HTMLElement;
        const next = event.relatedTarget as Node | null;
        if (next && container.contains(next)) {
            return;
        }
        historyOpen = false;
    }

    // Buttons do not take focus on mousedown in every browser, so block the
    // default to keep the input focused and let the click land before focusout.
    function keepSearchFocus(event: MouseEvent) {
        event.preventDefault();
    }

    async function selectHistoryEntry(entry: string) {
        historyOpen = false;
        query = entry;
        searchHistory.record(entry);
        await performSearch();
    }

    async function applyFilters(nextFilters: CatalogFilters) {
        await performSearch(nextFilters);
    }

    async function loadMore() {
        if (response.nextPage === null || loadingMore) {
            return;
        }
        loadMoreController?.abort();
        loadMoreController = new AbortController();
        const params = serializeCatalogSearch({
            query: query.trim(),
            page: response.nextPage,
            filters,
        });
        loadingMore = true;
        try {
            const apiResponse = await fetch(`/api/search?${params}`, {
                signal: loadMoreController.signal,
            });
            if (!apiResponse.ok) {
                throw new Error(`Search request failed with ${apiResponse.status}`);
            }
            const jsonResponse: CatalogSearchJsonResponse = await apiResponse.json();
            const nextResponse = fromCatalogSearchJson(jsonResponse);
            if (response.scope === "all" && nextResponse.scope === "all") {
                const seenLibrary = new Set(response.libraryItems.map((item) => item.id));
                const seenCatalog = new Set(response.catalogItems.map((item) => `${item.mediaType}:${item.tmdbId}`));
                response = {
                    ...nextResponse,
                    libraryItems: [
                        ...response.libraryItems,
                        ...nextResponse.libraryItems.filter((item) => !seenLibrary.has(item.id)),
                    ],
                    catalogItems: [
                        ...response.catalogItems,
                        ...nextResponse.catalogItems.filter(
                            (item) => !seenCatalog.has(`${item.mediaType}:${item.tmdbId}`)
                        ),
                    ],
                    seasonsByMediaId: {
                        ...response.seasonsByMediaId,
                        ...nextResponse.seasonsByMediaId,
                    },
                };
            } else if (response.scope === "catalog" && nextResponse.scope === "catalog") {
                const seen = new Set(response.items.map((item) => `${item.mediaType}:${item.tmdbId}`));
                response = {
                    ...nextResponse,
                    items: [
                        ...response.items,
                        ...nextResponse.items.filter((item) => !seen.has(`${item.mediaType}:${item.tmdbId}`)),
                    ],
                };
            } else if (response.scope === "library" && nextResponse.scope === "library") {
                const seen = new Set(response.items.map((item) => item.id));
                response = {
                    ...nextResponse,
                    items: [...response.items, ...nextResponse.items.filter((item) => !seen.has(item.id))],
                    seasonsByMediaId: {
                        ...response.seasonsByMediaId,
                        ...nextResponse.seasonsByMediaId,
                    },
                };
            }
        } catch (cause) {
            if (!(cause instanceof DOMException && cause.name === "AbortError")) {
                console.error("Failed to load more search results:", cause);
            }
        } finally {
            loadingMore = false;
        }
    }

    function deleteMedia(id: string) {
        confirmDelete(
            "Delete Media",
            "Are you sure you want to remove this item? This action cannot be undone.",
            async () => {
                try {
                    await deleteMediaMutation.mutateAsync(id);
                } catch (cause) {
                    console.error("Failed to delete media:", cause);
                }
            }
        );
    }

    async function addMagnet() {
        if (!magnetInput.trim()) {
            error = "Please enter a magnet link";
            return;
        }
        if (!magnetInput.startsWith("magnet:")) {
            error = "Invalid magnet link format";
            return;
        }
        error = "";
        adding = true;
        try {
            await addMediaMutation.mutateAsync({ magnetLink: magnetInput });
            magnetInput = "";
            uiState.addMediaDialogOpen = false;
            await performSearch();
        } catch (cause) {
            error = (cause as Error).message || "Failed to add media";
        } finally {
            adding = false;
        }
    }

    async function getMagnetLink(item: BrowseItem): Promise<string | null> {
        if (item.magnetLink) {
            return item.magnetLink;
        }
        resolvingItems = new Set(resolvingItems).add(item.tmdbId);
        try {
            const result = await resolveTorrentCached({
                imdbId: item.imdbId,
                tmdbId: item.tmdbId,
                title: item.title,
            });
            if (!(result.success && result.torrent)) {
                console.error("Failed to resolve torrent:", result.message || result.error);
                return null;
            }
            return result.torrent.magnetLink;
        } catch (cause) {
            console.error("Failed to resolve torrent:", cause);
            return null;
        } finally {
            const updated = new Set(resolvingItems);
            updated.delete(item.tmdbId);
            resolvingItems = updated;
        }
    }

    async function addCatalogItem(item: BrowseItem, watchNow: boolean) {
        if (addingItems.has(item.tmdbId)) {
            return;
        }
        addingItems = new Set(addingItems).add(item.tmdbId);
        try {
            const magnetLink = await getMagnetLink(item);
            if (!magnetLink) {
                throw new Error("Could not resolve magnet link");
            }
            const media = await addToLibraryMutation.mutateAsync({
                magnetLink,
                title: item.title,
                year: item.year,
                tmdbId: item.tmdbId,
            });
            if (watchNow && "id" in media) {
                await goto(`/watch/${media.id}`);
            }
        } catch (cause) {
            console.error("Failed to add catalog item:", cause);
        } finally {
            const updated = new Set(addingItems);
            updated.delete(item.tmdbId);
            addingItems = updated;
        }
    }

    async function handlePrefetch(item: BrowseItem) {
        await getMagnetLink(item);
    }

    async function getSeasons(item: BrowseItem): Promise<CatalogSeason[]> {
        const cached = seasonsCache.get(item.tmdbId);
        if (cached) {
            return cached;
        }
        seasonsLoading = new Set(seasonsLoading).add(item.tmdbId);
        try {
            const seasonResponse = await fetchSeasonsCached(item.tmdbId);
            const seasonData: CatalogSeason[] = seasonResponse.seasons.map((season: SeasonSummary) => ({
                seasonNumber: season.seasonNumber,
                name: season.name,
                episodeCount: season.episodeCount,
                year: season.year,
                posterPath: season.posterPath,
            }));
            seasonsCache = new Map(seasonsCache).set(item.tmdbId, seasonData);
            return seasonData;
        } catch (cause) {
            console.error("Failed to fetch seasons:", cause);
            return [];
        } finally {
            const updated = new Set(seasonsLoading);
            updated.delete(item.tmdbId);
            seasonsLoading = updated;
        }
    }

    async function handlePrefetchSeasons(item: BrowseItem) {
        if (item.mediaType === "show") {
            await getSeasons(item);
        }
    }

    async function handleSelectSeason(item: BrowseItem, seasonNumber: number) {
        if (addingItems.has(item.tmdbId)) {
            return;
        }
        addingItems = new Set(addingItems).add(item.tmdbId);
        try {
            await addToLibraryMutation.mutateAsync({
                mode: "browse-season",
                title: item.title,
                year: item.year,
                tmdbId: item.tmdbId,
                seasonNumber,
                posterUrl: item.posterUrl,
                backdropUrl: item.backdropUrl,
                overview: item.overview,
                genres: item.genres,
                certification: item.certification,
            });
        } catch (cause) {
            console.error("Failed to add season to library:", cause);
        } finally {
            const updated = new Set(addingItems);
            updated.delete(item.tmdbId);
            addingItems = updated;
        }
    }

    onDestroy(() => {
        loadMoreController?.abort();
    });
</script>

{#snippet renderLibraryResults(
    items: Media[],
    seasonsByMediaId: Record<string, SeasonWithEpisodes[]>
)}
    {#each items as media (media.id)}
        <MediaCard {media} seasons={seasonsByMediaId[media.id] ?? []} onDelete={deleteMedia} />
    {/each}
{/snippet}

{#snippet renderCatalogResults(items: BrowseItem[])}
    {#each items as item (`${item.mediaType}:${item.tmdbId}`)}
        <TorrentCard
            {item}
            onAddToLibrary={(catalogItem) => addCatalogItem(catalogItem, false)}
            onWatchNow={(catalogItem) => addCatalogItem(catalogItem, true)}
            onPrefetch={handlePrefetch}
            onSelectSeason={handleSelectSeason}
            onPrefetchSeasons={handlePrefetchSeasons}
            isAdding={addingItems.has(item.tmdbId)}
            isResolving={resolvingItems.has(item.tmdbId)}
            seasons={seasonsCache.get(item.tmdbId) ?? []}
            seasonsLoading={seasonsLoading.has(item.tmdbId)}
        />
    {/each}
{/snippet}

<div class="mx-auto min-h-screen max-w-7xl px-4 pb-28 pt-8 sm:px-6 sm:pt-10 lg:px-8">
    <header class="mx-auto mb-10 max-w-4xl">
        <h1 class="text-2xl font-semibold tracking-tight text-white">Search</h1>
        <p class="mt-1 text-sm text-muted-foreground">Find movies, TV shows, or something already in your library.</p>
        <div class="mt-5 flex items-center gap-2" role="search">
            <div class="relative min-w-0 flex-1" onfocusout={handleSearchFocusOut}>
                <label class="relative block">
                    <span class="sr-only">Search titles</span>
                    <Search
                        class="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                        type="search"
                        bind:value={query}
                        oninput={() => (historyOpen = true)}
                        onfocus={() => (historyOpen = true)}
                        onkeydown={handleSearchKeydown}
                        placeholder={getSearchPlaceholder(filters.scope)}
                        autocomplete="off"
                        class="h-13 w-full rounded-2xl border border-white/10 bg-white/4 pl-12 pr-4 text-base text-white outline-none transition-colors placeholder:text-muted-foreground hover:bg-white/6 focus:border-white/20 focus:bg-white/6 focus:ring-2 focus:ring-primary/25"
                    >
                    {#if searching}
                        <LoaderCircle
                            class="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
                        />
                    {/if}
                </label>
                {#if historyOpen && historyMatches.length > 0}
                    <div
                        class="absolute inset-x-0 top-full z-70 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-black/97 p-1 shadow-2xl backdrop-blur-2xl"
                    >
                        {#each historyMatches as entry (entry)}
                            <button
                                type="button"
                                class="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-white hover:bg-white/8"
                                onmousedown={keepSearchFocus}
                                onclick={() => selectHistoryEntry(entry)}
                            >
                                <Clock class="h-4 w-4 shrink-0 text-muted-foreground" />
                                <span class="truncate">{entry}</span>
                            </button>
                        {/each}
                        <button
                            type="button"
                            class="mt-1 w-full rounded-xl border-t border-white/10 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-white/8 hover:text-white"
                            onmousedown={keepSearchFocus}
                            onclick={() => searchHistory.clear()}
                        >
                            Clear recent searches
                        </button>
                    </div>
                {/if}
            </div>
            <CatalogFilterButton {filters} showSource onApply={applyFilters} class="h-13 shrink-0 rounded-2xl" />
        </div>
    </header>

    <section aria-live="polite" aria-busy={searching}>
        {#if searching}
            <div class="flex items-center justify-center p-16">
                <LoaderCircle class="h-8 w-8 animate-spin text-primary" />
            </div>
        {:else}
            {#if getResponseItemCount(response) === 0}
                <div
                    class="mx-auto flex max-w-xl flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/3 px-6 py-16 text-center"
                >
                    <div class="rounded-full bg-white/5 p-4">
                        <Film class="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h2 class="mt-4 text-lg font-semibold text-white">
                        {query ? "No matching titles on this page" : "No titles match these filters on this page"}
                    </h2>
                    <p class="mt-1 text-sm text-muted-foreground">
                        {response.nextPage === null
                            ? "Change the search text or clear one or more filters."
                            : "Continue to the next page or change the filters."}
                    </p>
                </div>
            {:else}
                <div class="mb-4 flex items-center justify-between gap-4">
                    <span class="text-xs text-muted-foreground">{getResponseItemCount(response)} results</span>
                </div>

                <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {#if response.scope === "all"}
                        {@render renderLibraryResults(response.libraryItems, response.seasonsByMediaId)}
                        {@render renderCatalogResults(response.catalogItems)}
                    {:else if response.scope === "library"}
                        {@render renderLibraryResults(response.items, response.seasonsByMediaId)}
                    {:else}
                        {@render renderCatalogResults(response.items)}
                    {/if}
                </div>
            {/if}

            {#if response.nextPage !== null}
                <div class="mt-10 flex justify-center">
                    <Button variant="secondary" class="min-w-36 rounded-xl" disabled={loadingMore} onclick={loadMore}>
                        {#if loadingMore}
                            <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
                            Loading...
                        {:else}
                            Load more
                        {/if}
                    </Button>
                </div>
            {/if}
        {/if}
    </section>
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
            onkeydown={(e: KeyboardEvent) => e.key === "Enter" && addMagnet()}
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
