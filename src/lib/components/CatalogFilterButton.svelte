<script lang="ts">
    import { SlidersHorizontal } from "@lucide/svelte";
    import { Dialog, Popover } from "bits-ui";
    import CatalogFilterPanel from "$lib/components/CatalogFilterPanel.svelte";
    import { type CatalogFilters, DEFAULT_CATALOG_FILTERS } from "$lib/data/search";
    import { cn } from "$lib/utils";

    let {
        filters,
        onApply,
        class: className,
        showSource = false,
    }: {
        filters: CatalogFilters;
        onApply: (filters: CatalogFilters) => void;
        class?: string;
        showSource?: boolean;
    } = $props();

    let desktopOpen = $state(false);
    let mobileOpen = $state(false);
    const activeCount = $derived(
        Number(showSource && filters.scope !== "all") +
            Number(filters.media !== DEFAULT_CATALOG_FILTERS.media) +
            Number(filters.rating > DEFAULT_CATALOG_FILTERS.rating) +
            Number(filters.yearFrom !== null || filters.yearTo !== null) +
            filters.genres.length +
            Number(filters.sort !== DEFAULT_CATALOG_FILTERS.sort)
    );
    const triggerClass = $derived(
        cn(
            "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 font-medium text-sm text-white shadow-sm transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className
        )
    );

    function apply(filtersToApply: CatalogFilters) {
        desktopOpen = false;
        mobileOpen = false;
        onApply(filtersToApply);
    }

    function close() {
        desktopOpen = false;
        mobileOpen = false;
    }
</script>

<div class="hidden sm:block">
    <Popover.Root bind:open={desktopOpen}>
        <Popover.Trigger class={triggerClass} aria-label="Filter titles">
            <SlidersHorizontal class="h-4 w-4" />
            Filters
            {#if activeCount > 0}
                <span
                    class="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[11px] leading-none text-primary-foreground"
                >
                    {activeCount}
                </span>
            {/if}
        </Popover.Trigger>
        <Popover.Portal>
            <Popover.Content
                side="bottom"
                align="end"
                sideOffset={10}
                class="z-70 w-[26rem] overflow-hidden rounded-2xl border border-white/10 bg-black/97 text-foreground shadow-2xl backdrop-blur-2xl focus:outline-none"
            >
                <CatalogFilterPanel {filters} {showSource} onApply={apply} onCancel={close} />
            </Popover.Content>
        </Popover.Portal>
    </Popover.Root>
</div>

<div class="sm:hidden">
    <Dialog.Root bind:open={mobileOpen}>
        <Dialog.Trigger class={triggerClass} aria-label="Filter titles">
            <SlidersHorizontal class="h-4 w-4" />
            Filters
            {#if activeCount > 0}
                <span
                    class="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[11px] leading-none text-primary-foreground"
                >
                    {activeCount}
                </span>
            {/if}
        </Dialog.Trigger>
        <Dialog.Portal>
            <Dialog.Overlay class="fixed inset-0 z-70 bg-black/75 backdrop-blur-sm" />
            <Dialog.Content
                class="fixed inset-x-0 bottom-0 z-80 max-h-[92dvh] overflow-hidden rounded-t-3xl border border-b-0 border-white/10 bg-black/98 text-foreground shadow-2xl focus:outline-none"
            >
                <Dialog.Title class="sr-only">Filter titles</Dialog.Title>
                <Dialog.Description class="sr-only">
                    {showSource
                        ? "Filter by source, media type, rating, release year, genre, and sort order."
                        : "Filter by media type, rating, release year, genre, and sort order."}
                </Dialog.Description>
                <div class="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/20"></div>
                <CatalogFilterPanel {filters} {showSource} onApply={apply} onCancel={close} />
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>
</div>
