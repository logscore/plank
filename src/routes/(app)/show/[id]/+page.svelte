<script lang="ts">
    import { ArrowLeft, Calendar, Database, Film, Trash2 } from "@lucide/svelte";
    import { Tabs } from "bits-ui";
    import { goto, invalidate, replaceState } from "$app/navigation";
    import { page } from "$app/state";
    import EpisodeSelector from "$lib/components/EpisodeSelector.svelte";
    import MediaRow from "$lib/components/MediaRow.svelte";
    import OpenSubtitlesDialog from "$lib/components/OpenSubtitlesDialog.svelte";
    import RedownloadDialog from "$lib/components/RedownloadDialog.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import { createDeleteMediaMutation, createRetryMediaMutation } from "$lib/data/media";
    import type { Media, SeasonWithEpisodes } from "$lib/types";
    import { confirmDelete, uiState } from "$lib/ui-state.svelte";
    import { canPlayEpisode, formatFileSize } from "$lib/utils";
    import type { PageData } from "./$types";

    let { data } = $props<{ data: PageData }>();
    const media: Media = $derived(data.media);
    const seasons: SeasonWithEpisodes[] = $derived(data.seasons);
    let selectedSeason = $state<number | null>(null);
    let deleting = $state(false);
    let retryingEpisodeIds = $state<Set<string>>(new Set());
    let redownloadDialogOpen = $state(false);
    let selectedEpisode = $state<Media | null>(null);
    // OpenSubtitles dialog state
    let openSubtitlesDialogOpen = $state(false);
    let subtitleDialogMediaId = $state<string | undefined>(undefined);
    let subtitleDialogSeasonNumber = $state<number | undefined>(undefined);
    let subtitleDialogEpisodeNumber = $state<number | null>(null);
    let subtitleDialogTitle = $state("");
    const deleteMediaMutation = createDeleteMediaMutation();
    const retryMediaMutation = createRetryMediaMutation();

    function openSubtitlesForEpisode(episode: Media) {
        subtitleDialogMediaId = episode.id;
        subtitleDialogSeasonNumber = currentSeason?.seasonNumber;
        subtitleDialogEpisodeNumber = episode.episodeNumber;
        subtitleDialogTitle = `${media?.title} - S${String(currentSeason?.seasonNumber ?? 0).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`;
        openSubtitlesDialogOpen = true;
    }

    function handlePlayEpisode(episode: Media) {
        if (canPlayEpisode(episode)) {
            goto(`/watch/${episode.id}`);
        }
    }

    function openRedownloadDialog(episode: Media) {
        selectedEpisode = episode;
        redownloadDialogOpen = true;
    }

    async function refreshShow() {
        await invalidate(`/api/media/${media.id}`);
    }

    async function runEpisodeRetry(
        episode: Media,
        body?: { mode?: "same" | "replace" | "remove"; magnetLink?: string }
    ) {
        if (retryingEpisodeIds.has(episode.id)) {
            return false;
        }

        retryingEpisodeIds = new Set(retryingEpisodeIds).add(episode.id);
        try {
            await retryMediaMutation.mutateAsync({
                id: episode.id,
                mode: body?.mode,
                magnetLink: body?.magnetLink,
            });
            await invalidate(`/api/media/${media.id}`);
            return true;
        } catch (error) {
            console.error("Failed to run episode retry action:", error);
            return false;
        } finally {
            const updated = new Set(retryingEpisodeIds);
            updated.delete(episode.id);
            retryingEpisodeIds = updated;
        }
    }

    function handleRemoveEpisodeDownload(episode: Media) {
        confirmDelete(
            "Remove Episode Download",
            "This removes the downloaded file but keeps the episode metadata so you can redownload it later.",
            async () => {
                await runEpisodeRetry(episode, { mode: "remove" });
            }
        );
    }

    function formatRuntime(minutes: number | null): string {
        if (!minutes) {
            return "";
        }
        if (minutes < 60) {
            return `${minutes}m`;
        }
        return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    }

    function formatDate(date: string | Date | null): string {
        if (!date) {
            return "Unknown";
        }
        return new Date(date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    }

    function getSelectedSeasonFromUrl(): number | null {
        const seasonParam = page.url.searchParams.get("s");
        if (!seasonParam) {
            return null;
        }

        const seasonNumber = Number.parseInt(seasonParam, 10);
        return Number.isNaN(seasonNumber) ? null : seasonNumber;
    }

    function handleSelectSeason(seasonNumber: number) {
        selectedSeason = seasonNumber;
        const nextUrl = new URL(page.url);
        nextUrl.searchParams.set("s", String(seasonNumber));
        replaceState(nextUrl, page.state);
    }

    function handleDelete() {
        confirmDelete(
            "Delete Show",
            "Are you sure you want to delete this show? This action cannot be undone.",
            async () => {
                deleting = true;
                try {
                    await deleteMediaMutation.mutateAsync(media.id);
                    await goto("/");
                } catch (error) {
                    console.error("Failed to delete show:", error);
                } finally {
                    deleting = false;
                }
            }
        );
    }

    function getColorForCertification(cert: string | null): string {
        if (!cert) {
            return "border-white/30 text-white";
        }
        switch (cert.toUpperCase()) {
            case "TV-Y":
            case "TV-G":
            case "G":
                return "bg-green-500/20 text-green-400 border-green-500/30";
            case "TV-PG":
            case "PG":
                return "bg-blue-500/20 text-blue-400 border-blue-500/30";
            case "TV-14":
            case "PG-13":
                return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
            case "TV-MA":
            case "R":
            case "NC-17":
                return "bg-red-500/20 text-red-400 border-red-500/30";
            default:
                return "border-white/30 text-white";
        }
    }

    function parseGenres(genresStr: string | null): string[] {
        if (!genresStr) {
            return [];
        }
        try {
            return JSON.parse(genresStr);
        } catch {
            return [];
        }
    }

    const currentSeason = $derived(seasons.find((s) => s.seasonNumber === selectedSeason));
    const allEpisodes = $derived(seasons.flatMap((season) => season.episodes));
    const downloadedEpisodeCount = $derived(
        allEpisodes.filter((episode) => episode.status === "complete" || episode.filePath).length
    );
    const totalEpisodeSize = $derived(allEpisodes.reduce((sum, episode) => sum + (episode.fileSize ?? 0), 0));
    const showStatus = $derived.by(() => {
        if (allEpisodes.length === 0) {
            return "pending";
        }
        if (allEpisodes.every((episode) => episode.status === "complete" || episode.filePath)) {
            return "complete";
        }
        if (allEpisodes.some((episode) => episode.status === "downloading" || episode.status === "searching")) {
            return "downloading";
        }
        if (allEpisodes.some((episode) => episode.status === "error" || episode.status === "not_found")) {
            return "error";
        }
        return "pending";
    });

    $effect(() => {
        const requestedSeason = getSelectedSeasonFromUrl();
        if (seasons.length === 0) {
            selectedSeason = null;
            return;
        }
        if (requestedSeason !== null && seasons.some((season) => season.seasonNumber === requestedSeason)) {
            selectedSeason = requestedSeason;
            return;
        }
        if (selectedSeason === null || !seasons.some((season) => season.seasonNumber === selectedSeason)) {
            selectedSeason = seasons[0].seasonNumber;
        }
    });

    $effect(() => {
        const hasActiveEpisodes = allEpisodes.some(
            (episode) => episode.status === "searching" || episode.status === "downloading"
        );
        if (!hasActiveEpisodes) {
            return;
        }
        const interval = window.setInterval(() => {
            invalidate(`/api/media/${media.id}`);
        }, 5000);
        return () => {
            window.clearInterval(interval);
        };
    });
</script>

<svelte:head>
    <title>{media?.title ?? "Show"} | Plank</title>
</svelte:head>

{#if media}
    <!-- Hero Section -->
    <div class="relative min-h-screen overflow-hidden pb-12">
        <!-- Hero Section with Backdrop -->
        {#if media.backdropUrl || media.posterUrl}
            <picture>
                {#if media.backdropUrl}
                    <source media="(min-width: 1024px)" srcset={media.backdropUrl}>
                {/if}
                <img
                    src={media.posterUrl ?? media.backdropUrl}
                    alt={media.title}
                    class="absolute inset-0 h-full w-full object-cover opacity-30 lg:opacity-20"
                >
            </picture>
        {/if}
        <div class="absolute inset-0 bg-linear-to-b from-background/30 via-background/80 to-background"></div>

        <div class="fixed left-6 top-6 z-50">
            <Button
                variant="ghost"
                class="rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
                onclick={() => window.history.back()}
            >
                <ArrowLeft class="mr-2 h-5 w-5" />
                Back
            </Button>
        </div>

        <!-- Content -->
        <div class="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <div class="grid gap-8 lg:grid-cols-[280px_1fr] lg:items-end">
                <!-- Poster -->
                <div class="hidden overflow-hidden rounded-2xl border border-white/10 shadow-2xl lg:block">
                    {#if media.posterUrl}
                        <img src={media.posterUrl} alt={media.title} class="w-full object-cover">
                    {:else}
                        <div class="flex aspect-2/3 w-full items-center justify-center bg-accent">
                            <Film class="w-16 h-16 text-muted-foreground" />
                        </div>
                    {/if}
                </div>

                <!-- Details -->
                <div class="space-y-6">
                    <!-- Title -->
                    <div>
                        <h1 class="text-4xl font-semibold tracking-tight text-white sm:text-5xl">{media.title}</h1>
                    </div>

                    <!-- Meta Badges -->
                    <div class="flex flex-wrap items-center gap-3 text-sm">
                        {#if media.certification}
                            <span
                                class="px-3 py-1 rounded-full border font-bold {getColorForCertification(
                                    media.certification,
                                )}"
                            >
                                {media.certification}
                            </span>
                        {/if}
                        {#if media.year}
                            <span class="rounded-full border border-white/15 px-3 py-1 text-muted-foreground"
                                >{media.year}</span
                            >
                        {/if}
                        {#if media.runtime}
                            <span class="rounded-full border border-white/15 px-3 py-1 text-muted-foreground">
                                {formatRuntime(media.runtime)}
                                avg
                            </span>
                        {/if}
                        {#if media.totalSeasons}
                            <span class="rounded-full border border-white/15 px-3 py-1 text-muted-foreground">
                                {media.totalSeasons}
                                {media.totalSeasons === 1
                                    ? "Season"
                                    : "Seasons"}
                            </span>
                        {/if}
                    </div>

                    <!-- Genres -->
                    {#if parseGenres(media.genres).length > 0}
                        <div class="flex flex-wrap gap-2">
                            {#each parseGenres(media.genres) as genre}
                                <span class="rounded-full bg-white/5 px-3 py-1 text-sm text-zinc-300">{genre}</span>
                            {/each}
                        </div>
                    {/if}

                    <!-- Action Buttons -->
                    <div class="flex flex-wrap items-center gap-3 pt-2">
                        <EpisodeSelector {seasons} onPlayEpisode={handlePlayEpisode} />
                        <Button
                            variant="ghost"
                            size="lg"
                            class="text-white hover:bg-neutral-800"
                            onclick={handleDelete}
                            disabled={deleting}
                        >
                            <Trash2 class="w-5 h-5 mr-2" />
                            {deleting ? "Deleting..." : "Delete"}
                        </Button>
                    </div>

                    <!-- Overview -->
                    {#if media.overview}
                        <div>
                            <h2 class="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                Overview
                            </h2>
                            <p class="max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base">{media.overview}</p>
                        </div>
                    {/if}

                    <!-- Episode Selector (Moved here or kept below?) -->
                    <!-- We'll keep it in the main flow but styled appropriately -->
                </div>
            </div>

            <!-- Seasons & Episodes -->
            <div class="mt-8">
                <h2 class="mb-6 text-2xl font-semibold tracking-tight text-white">Seasons & Episodes</h2>

                <!-- Season Tabs -->
                {#if seasons.length > 0}
                    <Tabs.Root
                        value={String(selectedSeason ?? "")}
                        onValueChange={(value) => handleSelectSeason(Number(value))}
                    >
                        <Tabs.List class="flex gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
                            {#each seasons as season (season.seasonNumber)}
                                <Tabs.Trigger
                                    value={String(season.seasonNumber)}
                                    class="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors cursor-pointer hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:hover:bg-primary/90"
                                >
                                    {season.name || `Season ${season.seasonNumber}`}
                                </Tabs.Trigger>
                            {/each}
                        </Tabs.List>

                        <!-- Episode List -->
                        {#if currentSeason}
                            <Tabs.Content value={String(currentSeason.seasonNumber)} class="space-y-4">
                                {#each currentSeason.episodes as episode (episode.id)}
                                    <MediaRow
                                        media={episode}
                                        busy={retryingEpisodeIds.has(episode.id)}
                                        subtitleTracks={data.subtitleTracksByMediaId[episode.id] ?? []}
                                        onPlay={handlePlayEpisode}
                                        onRedownload={openRedownloadDialog}
                                        onRemoveDownload={handleRemoveEpisodeDownload}
                                        onAddSubtitles={openSubtitlesForEpisode}
                                    />
                                {/each}

                                {#if currentSeason.episodes.length === 0}
                                    <div class="text-center py-12 text-muted-foreground">
                                        No episodes available for this season
                                    </div>
                                {/if}
                            </Tabs.Content>
                        {/if}
                    </Tabs.Root>
                {:else}
                    <div class="text-center py-12 text-muted-foreground">No seasons available</div>
                {/if}
            </div>
        </div>
    </div>

    <!-- Technical Details (Info Cards) -->
    <div class="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 gap-4 pb-12 md:grid-cols-2">
            <div class="space-y-4 rounded-2xl border border-white/10 bg-card/70 p-5">
                <h3 class="text-lg font-semibold flex items-center gap-2">
                    <Database class="w-5 h-5 text-primary" />
                    File Information
                </h3>
                <div class="space-y-3 text-sm">
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">Status</span>
                        <span class="capitalize font-medium text-muted-foreground">{showStatus}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">Episodes Downloaded</span>
                        <span class="font-medium">{downloadedEpisodeCount} / {allEpisodes.length}</span>
                    </div>
                </div>
            </div>

            <div class="space-y-4 rounded-2xl border border-white/10 bg-card/70 p-5">
                <h3 class="text-lg font-semibold flex items-center gap-2">
                    <Database class="w-5 h-5 text-primary" />
                    Library Footprint
                </h3>
                <div class="space-y-3 text-sm">
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">Downloaded Size</span>
                        <span class="font-medium">{formatFileSize(totalEpisodeSize)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">Current Season</span>
                        <span class="font-medium"
                            >{currentSeason?.name ||
                                `Season ${selectedSeason ?? 1}`}</span
                        >
                    </div>
                </div>
            </div>

            <div class="space-y-4 rounded-2xl border border-white/10 bg-card/70 p-5">
                <h3 class="text-lg font-semibold flex items-center gap-2">
                    <Calendar class="w-5 h-5 text-primary" />
                    Dates
                </h3>
                <div class="space-y-3 text-sm">
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">Added</span>
                        <span class="font-medium">{formatDate(media.addedAt)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">Last Played</span>
                        <span class="font-medium"
                            >{media.lastPlayedAt
                                ? formatDate(media.lastPlayedAt)
                                : "Never"}</span
                        >
                    </div>
                </div>
            </div>

            <div class="space-y-4 rounded-2xl border border-white/10 bg-card/70 p-5">
                <h3 class="text-lg font-semibold flex items-center gap-2">
                    <Film class="w-5 h-5 text-primary" />
                    Metadata
                </h3>
                <div class="space-y-3 text-sm">
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">TMDB ID</span>
                        <span class="font-medium">{media.tmdbId || "Not linked"}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">Show ID</span>
                        <code class="text-xs bg-accent px-2 py-1 rounded">{media.id}</code>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <RedownloadDialog bind:open={redownloadDialogOpen} media={selectedEpisode} onRetried={refreshShow} />

    <OpenSubtitlesDialog
        bind:open={openSubtitlesDialogOpen}
        mediaId={subtitleDialogMediaId ?? media.id}
        mediaTitle={subtitleDialogTitle}
        seasonNumber={subtitleDialogSeasonNumber}
        episodeNumber={subtitleDialogEpisodeNumber}
    />
{:else}
    <div class="flex items-center justify-center min-h-screen">
        <p class="text-muted-foreground">Show not found</p>
    </div>
{/if}
