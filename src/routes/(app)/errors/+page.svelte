<script lang="ts">
    import { ArrowLeft, CircleCheck } from "@lucide/svelte";
    import { goto } from "$app/navigation";
    import MediaRow from "$lib/components/MediaRow.svelte";
    import RedownloadDialog from "$lib/components/RedownloadDialog.svelte";
    import { createRetryMediaMutation } from "$lib/data/media";
    import type { Media } from "$lib/types";
    import { confirmDelete } from "$lib/ui-state.svelte";
    import { canPlayEpisode } from "$lib/utils";
    import type { PageData } from "./$types";

    let { data } = $props<{ data: PageData }>();

    const movies = $derived(data.movies);
    const episodes = $derived(data.episodes);
    const errorCount = $derived(movies.length + episodes.length);

    const retryMutation = createRetryMediaMutation();
    let busyIds = $state<Set<string>>(new Set());
    let redownloadOpen = $state(false);
    let selected = $state<Media | null>(null);

    function episodeLabel(episode: Media & { showTitle: string | null }): string {
        const season = String(episode.seasonNumber ?? 0).padStart(2, "0");
        const number = String(episode.episodeNumber ?? 0).padStart(2, "0");
        return `${episode.showTitle ?? "Unknown show"} • S${season}E${number}`;
    }

    function handlePlay(item: Media) {
        if (canPlayEpisode(item)) {
            goto(`/watch/${item.id}`);
        }
    }

    function openRedownload(item: Media) {
        selected = item;
        redownloadOpen = true;
    }

    async function removeDownload(item: Media) {
        if (busyIds.has(item.id)) {
            return;
        }
        busyIds = new Set(busyIds).add(item.id);
        try {
            await retryMutation.mutateAsync({ id: item.id, mode: "remove" });
        } catch (error) {
            console.error("Failed to remove download:", error);
        } finally {
            const next = new Set(busyIds);
            next.delete(item.id);
            busyIds = next;
        }
    }

    function confirmRemoveDownload(item: Media) {
        confirmDelete(
            "Remove Download",
            "This removes the downloaded file but keeps the metadata so you can redownload it later.",
            () => removeDownload(item)
        );
    }
</script>

<svelte:head>
    <title>Download errors | Plank</title>
</svelte:head>

<div class="mx-auto min-h-screen max-w-5xl px-4 pt-8 pb-28 sm:pt-12">
    <header class="mb-9">
        <a
            href="/"
            class="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-white"
        >
            <ArrowLeft class="h-4 w-4" />
            Library
        </a>
        <h1 class="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Download errors</h1>
    </header>

    {#if errorCount === 0}
        <div class="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div class="rounded-full bg-white/5 p-5">
                <CircleCheck class="h-9 w-9 text-emerald-500" />
            </div>
            <h2 class="mt-4 text-lg font-semibold text-white">No download errors</h2>
            <p class="mt-1 max-w-sm text-sm text-muted-foreground">Every title in your library downloaded fine.</p>
        </div>
    {/if}

    {#if movies.length > 0}
        <section class="mb-10">
            <h2 class="mb-4 text-xl font-semibold text-white">
                Movies
                <span class="ml-1 text-sm font-normal text-muted-foreground">{movies.length}</span>
            </h2>
            <div class="space-y-4">
                {#each movies as movie (movie.id)}
                    <MediaRow
                        media={movie}
                        label={movie.year ? `Movie • ${movie.year}` : "Movie"}
                        busy={busyIds.has(movie.id)}
                        onPlay={handlePlay}
                        onRedownload={openRedownload}
                        onRemoveDownload={confirmRemoveDownload}
                    />
                {/each}
            </div>
        </section>
    {/if}

    {#if episodes.length > 0}
        <section>
            <h2 class="mb-4 text-xl font-semibold text-white">
                Episodes
                <span class="ml-1 text-sm font-normal text-muted-foreground">{episodes.length}</span>
            </h2>
            <div class="space-y-4">
                {#each episodes as episode (episode.id)}
                    <MediaRow
                        media={episode}
                        label={episodeLabel(episode)}
                        busy={busyIds.has(episode.id)}
                        onPlay={handlePlay}
                        onRedownload={openRedownload}
                        onRemoveDownload={confirmRemoveDownload}
                    />
                {/each}
            </div>
        </section>
    {/if}
</div>

<RedownloadDialog bind:open={redownloadOpen} media={selected} />
