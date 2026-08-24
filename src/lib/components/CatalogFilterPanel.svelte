<script lang="ts">
    import { Check, ChevronDown, Star } from "@lucide/svelte";
    import { Combobox, RadioGroup, Slider } from "bits-ui";
    import SelectField from "$lib/components/ui/SelectField.svelte";
    import {
        CATALOG_GENRES,
        type CatalogFilters,
        type CatalogMediaType,
        DEFAULT_CATALOG_FILTERS,
        type SearchScope,
    } from "$lib/data/search";

    let {
        filters,
        onApply,
        onCancel,
        showSource = false,
    }: {
        filters: CatalogFilters;
        onApply: (filters: CatalogFilters) => void;
        onCancel: () => void;
        showSource?: boolean;
    } = $props();

    let scope = $state<SearchScope>("all");
    let media = $state<CatalogMediaType>(DEFAULT_CATALOG_FILTERS.media);
    let rating = $state(DEFAULT_CATALOG_FILTERS.rating);
    let yearFrom = $state<number | null>(DEFAULT_CATALOG_FILTERS.yearFrom);
    let yearTo = $state<number | null>(DEFAULT_CATALOG_FILTERS.yearTo);
    let genres = $state<string[]>([]);
    let sort = $state(DEFAULT_CATALOG_FILTERS.sort);
    let genreSearch = $state("");

    const sourceOptions = [
        { value: "all", label: "All" },
        { value: "library", label: "Library" },
        { value: "catalog", label: "Catalog" },
    ];
    const sortOptions = [
        { value: "relevance", label: "Relevance" },
        { value: "popular", label: "Popularity" },
        { value: "rating", label: "Rating" },
        { value: "newest", label: "Newest first" },
        { value: "oldest", label: "Oldest first" },
    ];
    const availableGenres = $derived(
        CATALOG_GENRES.filter((genre) => {
            if (media === "movie") {
                return genre.movieId !== undefined;
            }
            if (media === "show") {
                return genre.showId !== undefined;
            }
            return true;
        })
    );
    const filteredGenres = $derived(
        genreSearch
            ? availableGenres.filter((genre) => genre.label.toLowerCase().includes(genreSearch.toLowerCase()))
            : availableGenres
    );

    $effect(() => {
        scope = filters.scope;
        media = filters.media;
        rating = filters.rating;
        yearFrom = filters.yearFrom;
        yearTo = filters.yearTo;
        genres = [...filters.genres];
        sort = filters.sort;
        genreSearch = "";
    });

    function setScope(value: string) {
        if (value !== "all" && value !== "library" && value !== "catalog") {
            return;
        }
        scope = value;
    }

    function setMedia(value: string) {
        if (value !== "all" && value !== "movie" && value !== "show") {
            return;
        }
        media = value;
        const supportedKeys = new Set(
            CATALOG_GENRES.filter((genre) => {
                if (value === "movie") {
                    return genre.movieId !== undefined;
                }
                if (value === "show") {
                    return genre.showId !== undefined;
                }
                return true;
            }).map((genre) => genre.key)
        );
        genres = genres.filter((genre) => supportedKeys.has(genre));
    }

    function clearFilters() {
        scope = showSource ? "all" : filters.scope;
        media = DEFAULT_CATALOG_FILTERS.media;
        rating = DEFAULT_CATALOG_FILTERS.rating;
        yearFrom = DEFAULT_CATALOG_FILTERS.yearFrom;
        yearTo = DEFAULT_CATALOG_FILTERS.yearTo;
        genres = [];
        sort = DEFAULT_CATALOG_FILTERS.sort;
        genreSearch = "";
    }

    function applyFilters() {
        let normalizedYearFrom = yearFrom ?? null;
        let normalizedYearTo = yearTo ?? null;
        if (normalizedYearFrom !== null && normalizedYearTo !== null && normalizedYearFrom > normalizedYearTo) {
            [normalizedYearFrom, normalizedYearTo] = [normalizedYearTo, normalizedYearFrom];
        }
        onApply({
            ...filters,
            scope,
            media,
            rating,
            yearFrom: normalizedYearFrom,
            yearTo: normalizedYearTo,
            genres: [...genres],
            sort,
        });
    }
</script>

<div class="flex max-h-[min(78vh,680px)] flex-col">
    <div class="border-b border-white/10 px-5 py-4">
        <h2 class="text-lg font-semibold text-white">Filter titles</h2>
        <p class="mt-1 text-xs text-muted-foreground">Use the same filters across your library and catalog.</p>
    </div>

    <div class="space-y-5 overflow-y-auto px-5 py-5">
        {#if showSource}
            <fieldset class="space-y-2.5">
                <legend class="text-sm font-medium text-white">Source</legend>
                <RadioGroup.Root
                    value={scope}
                    onValueChange={setScope}
                    orientation="horizontal"
                    class="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1"
                >
                    {#each sourceOptions as option}
                        <RadioGroup.Item
                            value={option.value}
                            aria-label={option.label}
                            class="h-9 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-white/8 data-[state=checked]:bg-white/12 data-[state=checked]:text-white"
                        >
                            {option.label}
                        </RadioGroup.Item>
                    {/each}
                </RadioGroup.Root>
            </fieldset>
        {/if}

        <fieldset class="space-y-2.5">
            <legend class="text-sm font-medium text-white">Media type</legend>
            <RadioGroup.Root
                value={media}
                onValueChange={setMedia}
                orientation="horizontal"
                class="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1"
            >
                {#each [
                    { value: "all", label: "All" },
                    { value: "movie", label: "Movies" },
                    { value: "show", label: "TV Shows" },
                ] as option}
                    <RadioGroup.Item
                        value={option.value}
                        aria-label={option.label}
                        class="h-9 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-white/8 data-[state=checked]:bg-white/12 data-[state=checked]:text-white"
                    >
                        {option.label}
                    </RadioGroup.Item>
                {/each}
            </RadioGroup.Root>
        </fieldset>

        <fieldset class="space-y-3">
            <div class="flex items-center justify-between gap-4">
                <legend class="text-sm font-medium text-white">Minimum rating</legend>
                <span class="inline-flex min-w-14 items-center justify-end gap-1 text-sm tabular-nums text-primary">
                    <Star class="h-3.5 w-3.5 fill-current" />
                    {rating > 0 ? rating.toFixed(1) : "Any"}
                </span>
            </div>
            <Slider.Root
                type="single"
                bind:value={rating}
                min={0}
                max={10}
                step={0.5}
                class="relative flex h-6 w-full touch-none select-none items-center"
            >
                <span class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-white/10">
                    <Slider.Range class="absolute h-full bg-primary" />
                </span>
                <Slider.Thumb
                    index={0}
                    aria-label="Minimum rating"
                    class="block h-5 w-5 rounded-full border-2 border-primary bg-black shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
            </Slider.Root>
        </fieldset>

        <fieldset class="space-y-2.5">
            <legend class="text-sm font-medium text-white">Release year</legend>
            <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <label class="sr-only" for="catalog-year-from">From year</label>
                <input
                    id="catalog-year-from"
                    type="number"
                    min="1874"
                    max={new Date().getFullYear() + 2}
                    placeholder="From"
                    bind:value={yearFrom}
                    class="h-10 min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 text-sm tabular-nums text-white outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                >
                <span class="text-xs text-muted-foreground">to</span>
                <label class="sr-only" for="catalog-year-to">To year</label>
                <input
                    id="catalog-year-to"
                    type="number"
                    min="1874"
                    max={new Date().getFullYear() + 2}
                    placeholder="To"
                    bind:value={yearTo}
                    class="h-10 min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 text-sm tabular-nums text-white outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                >
            </div>
        </fieldset>

        <fieldset class="space-y-2.5">
            <legend class="text-sm font-medium text-white">Genres</legend>
            <Combobox.Root
                type="multiple"
                items={availableGenres.map((genre) => ({ value: genre.key, label: genre.label }))}
                bind:value={genres}
                onOpenChangeComplete={(open) => {
                    if (!open) {
                        genreSearch = "";
                    }
                }}
            >
                <div class="relative">
                    <Combobox.Input
                        oninput={(event) => {
                            genreSearch = event.currentTarget.value;
                        }}
                        class="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 pr-10 text-sm text-white outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                        placeholder={genres.length > 0 ? `${genres.length} selected` : "Search genres"}
                        aria-label="Search genres"
                    />
                    <Combobox.Trigger
                        class="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-white"
                        aria-label="Show genres"
                    >
                        <ChevronDown class="h-4 w-4" />
                    </Combobox.Trigger>
                </div>
                <Combobox.Portal>
                    <Combobox.Content
                        sideOffset={6}
                        class="z-90 max-h-64 min-w-[var(--bits-combobox-anchor-width)] overflow-y-auto rounded-xl border border-white/10 bg-black/98 p-1.5 text-white shadow-2xl focus:outline-none"
                    >
                        <Combobox.Viewport>
                            {#each filteredGenres as genre (genre.key)}
                                <Combobox.Item
                                    value={genre.key}
                                    label={genre.label}
                                    class="flex h-9 cursor-default select-none items-center rounded-lg px-3 text-sm outline-none data-highlighted:bg-white/10"
                                >
                                    {#snippet children({ selected })}
                                        {genre.label}
                                        {#if selected}
                                            <Check class="ml-auto h-4 w-4 text-primary" />
                                        {/if}
                                    {/snippet}
                                </Combobox.Item>
                            {:else}
                                <div class="px-3 py-4 text-center text-sm text-muted-foreground">No genres found</div>
                            {/each}
                        </Combobox.Viewport>
                    </Combobox.Content>
                </Combobox.Portal>
            </Combobox.Root>
            {#if genres.length > 0}
                <div class="flex flex-wrap gap-1.5">
                    {#each genres as key (key)}
                        {@const genre = CATALOG_GENRES.find((entry) => entry.key === key)}
                        {#if genre}
                            <button
                                type="button"
                                class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
                                onclick={() => {
                                    genres = genres.filter((value) => value !== key);
                                }}
                                aria-label={`Remove ${genre.label} filter`}
                            >
                                {genre.label} ×
                            </button>
                        {/if}
                    {/each}
                </div>
            {/if}
        </fieldset>

        <fieldset class="space-y-2.5">
            <legend class="text-sm font-medium text-white">Sort by</legend>
            <SelectField bind:value={sort} items={sortOptions} ariaLabel="Sort titles" class="w-full" />
        </fieldset>

        <p class="rounded-xl border border-white/8 bg-white/3 px-3 py-2.5 text-xs text-muted-foreground">
            Adult titles are hidden.
        </p>
    </div>

    <div class="grid grid-cols-3 gap-2 border-t border-white/10 px-5 py-4">
        <button
            type="button"
            class="h-10 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-white/8 hover:text-white"
            onclick={clearFilters}
        >
            Clear
        </button>
        <button
            type="button"
            class="h-10 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-white/8 hover:text-white"
            onclick={onCancel}
        >
            Cancel
        </button>
        <button
            type="button"
            class="h-10 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            onclick={applyFilters}
        >
            Apply
        </button>
    </div>
</div>
