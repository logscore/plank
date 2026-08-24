<script lang="ts">
    import { Film, LoaderCircle } from "@lucide/svelte";
    import { untrack } from "svelte";
    import { goto } from "$app/navigation";
    import CatalogFilterButton from "$lib/components/CatalogFilterButton.svelte";
    import ContinueWatchingCard from "$lib/components/ContinueWatchingCard.svelte";
    import MediaCard from "$lib/components/MediaCard.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import { createDeleteMediaMutation } from "$lib/data/media";
    import { type CatalogFilters, type CatalogSearchResponse, serializeCatalogSearch } from "$lib/data/search";
    import { confirmDelete } from "$lib/ui-state.svelte";
    import type { PageData } from "./$types";

    type LibraryResponse = Extract<CatalogSearchResponse, { scope: "library" }>;

    let { data } = $props<{ data: PageData }>();
    const deleteMutation = createDeleteMediaMutation();
    const continueWatching = $derived(data.continueWatching);
    let filters = $state<CatalogFilters>(
        untrack(() => ({ ...data.request.filters, genres: [...data.request.filters.genres] }))
    );
    let response = $state<LibraryResponse>(
        untrack(() =>
            data.response.scope === "library"
                ? data.response
                : { scope: "library", items: [], seasonsByMediaId: {}, nextPage: null }
        )
    );
    let loadingMore = $state(false);

    $effect(() => {
        filters = { ...data.request.filters, genres: [...data.request.filters.genres] };
        if (data.response.scope === "library") {
            response = data.response;
        }
    });

    async function applyFilters(nextFilters: CatalogFilters) {
        const params = serializeCatalogSearch({
            query: "",
            page: 1,
            filters: { ...nextFilters, scope: "library" },
        });
        params.delete("scope");
        await goto(params.size > 0 ? `?${params}` : "?", {
            noScroll: true,
            replaceState: true,
        });
    }

    async function loadMore() {
        if (response.nextPage === null || loadingMore) {
            return;
        }
        const params = serializeCatalogSearch({
            query: "",
            page: response.nextPage,
            filters: { ...filters, scope: "library" },
        });
        loadingMore = true;
        try {
            const apiResponse = await fetch(`/api/search?${params}`);
            if (!apiResponse.ok) {
                throw new Error(`Library request failed with ${apiResponse.status}`);
            }
            const nextResponse: CatalogSearchResponse = await apiResponse.json();
            if (nextResponse.scope !== "library") {
                throw new Error("Library request returned catalog results");
            }
            const seen = new Set(response.items.map((item) => item.id));
            response = {
                ...nextResponse,
                items: [...response.items, ...nextResponse.items.filter((item) => !seen.has(item.id))],
                seasonsByMediaId: {
                    ...response.seasonsByMediaId,
                    ...nextResponse.seasonsByMediaId,
                },
            };
        } catch (cause) {
            console.error("Failed to load more library titles:", cause);
        } finally {
            loadingMore = false;
        }
    }

    function deleteMedia(id: string, event: Event) {
        event.preventDefault();
        event.stopPropagation();
        confirmDelete(
            "Delete Media",
            "Are you sure you want to remove this? This action cannot be undone.",
            async () => {
                try {
                    await deleteMutation.mutateAsync(id);
                } catch (cause) {
                    console.error("Failed to delete media:", cause);
                }
            }
        );
    }
</script>

<div class="mx-auto min-h-screen max-w-7xl px-4 pb-28 pt-8 sm:pt-12">
    <header class="mb-9 flex items-end justify-between gap-4">
        <div>
            <h1 class="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Library</h1>
        </div>
        <CatalogFilterButton {filters} onApply={applyFilters} class="shrink-0" />
    </header>

    {#if continueWatching.length > 0}
        <section class="mb-10">
            <div class="mb-3 flex items-end justify-between">
                <h2 class="text-lg font-semibold text-white">Continue watching</h2>
            </div>
            <div class="-mx-2 flex gap-4 overflow-x-auto px-2 pb-4 pt-2 no-scrollbar">
                {#each continueWatching as item (item.id)}
                    <ContinueWatchingCard media={item} />
                {/each}
            </div>
        </section>
    {/if}

    <section>
        <div class="mb-5">
            <h2 class="mt-1 text-xl font-semibold text-white">
                Your
                {response.items.length === 1 ? "title" : "titles"}
            </h2>
        </div>

        {#if response.items.length === 0}
            <div
                class="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/3 px-6 py-16 text-center"
            >
                <div class="rounded-full bg-white/5 p-5">
                    <Film class="h-9 w-9 text-muted-foreground" />
                </div>
                <h3 class="mt-4 text-lg font-semibold text-white">No titles match these filters</h3>
                <p class="mt-1 max-w-sm text-sm text-muted-foreground">Clear a filter or add a title from Search.</p>
            </div>
        {:else}
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {#each response.items as media (media.id)}
                    <MediaCard {media} seasons={response.seasonsByMediaId[media.id] ?? []} onDelete={deleteMedia} />
                {/each}
            </div>

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
