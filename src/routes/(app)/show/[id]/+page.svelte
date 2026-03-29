<script lang="ts">
    import { ArrowLeft, Calendar, Database, Film, Play, RotateCcw, Trash2 } from '@lucide/svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import DeleteConfirmationModal from '$lib/components/DeleteConfirmationModal.svelte';
    import EpisodeSelector from '$lib/components/EpisodeSelector.svelte';
    import OpenSubtitlesDialog from '$lib/components/OpenSubtitlesDialog.svelte';
    import SubtitleMenu from '$lib/components/SubtitleMenu.svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import type { Media, SeasonWithEpisodes } from '$lib/types';
    import { confirmDelete, uiState } from '$lib/ui-state.svelte';

    let media: Media | null = $state(null);
    let seasons: SeasonWithEpisodes[] = $state([]);
    let loading = $state(true);
    let selectedSeason = $state<number | null>(null);
    let deleting = $state(false);
    let retryingEpisodeIds = $state<Set<string>>(new Set());
    // OpenSubtitles dialog state
    let openSubtitlesDialogOpen = $state(false);
    let subtitleDialogMediaId = $state<string | undefined>(undefined);
    let subtitleDialogSeasonNumber = $state<number | undefined>(undefined);
    let subtitleDialogEpisodeNumber = $state<number | undefined>(undefined);
    let subtitleDialogTitle = $state('');

    function openSubtitlesForEpisode(episode: Media) {
        subtitleDialogMediaId = episode.id;
        subtitleDialogSeasonNumber = currentSeason?.seasonNumber;
        subtitleDialogEpisodeNumber = episode.episodeNumber;
        subtitleDialogTitle = `${media?.title} - S${String(currentSeason?.seasonNumber ?? 0).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')}`;
        openSubtitlesDialogOpen = true;
    }

    async function loadShow(showSpinner = true) {
        if (showSpinner) {
            loading = true;
        }
        try {
            const [mediaRes, seasonsRes] = await Promise.all([
                fetch(`/api/media/${page.params.id}`),
                fetch(`/api/media/${page.params.id}/seasons`),
            ]);

            if (mediaRes.ok) {
                media = await mediaRes.json();
            }
            if (seasonsRes.ok) {
                seasons = await seasonsRes.json();
                if (seasons.length > 0) {
                    selectedSeason = seasons[0].seasonNumber;
                }
            }
        } catch (e) {
            console.error('Failed to load show:', e);
        } finally {
            if (showSpinner) {
                loading = false;
            }
        }
    }

    function handlePlayEpisode(episode: Media) {
        if (canPlayEpisode(episode)) {
            goto(`/watch/${episode.id}`);
        }
    }

    function canPlayEpisode(episode: Media): boolean {
        return Boolean(
            episode.filePath ||
                episode.fileIndex !== null ||
                episode.status === 'complete' ||
                episode.status === 'downloading'
        );
    }

    function getEpisodeStatusLabel(episode: Media): string {
        if (episode.status === 'complete' || episode.filePath) {
            return 'Downloaded';
        }
        if (episode.status === 'searching') {
            return 'Searching';
        }
        if (episode.status === 'downloading') {
            return 'Downloading';
        }
        if (episode.status === 'not_found') {
            return 'Not Found';
        }
        if (episode.status === 'error') {
            return 'Error';
        }
        return 'Pending';
    }

    function getEpisodeStatusClass(episode: Media): string {
        if (episode.status === 'complete' || episode.filePath) {
            return 'bg-emerald-500/20 text-emerald-300';
        }
        if (episode.status === 'downloading') {
            return 'bg-blue-500/20 text-blue-300';
        }
        if (episode.status === 'searching') {
            return 'bg-amber-500/20 text-amber-300';
        }
        if (episode.status === 'not_found' || episode.status === 'error') {
            return 'bg-red-500/20 text-red-300';
        }
        return 'bg-muted text-muted-foreground';
    }

    async function handleRetryEpisode(episode: Media) {
        if (retryingEpisodeIds.has(episode.id)) {
            return;
        }
        retryingEpisodeIds = new Set(retryingEpisodeIds).add(episode.id);
        try {
            const response = await fetch(`/api/media/${episode.id}/retry`, {
                method: 'POST',
            });
            if (!response.ok) {
                throw new Error('Retry failed');
            }
            await loadShow(false);
        } catch (e) {
            console.error('Failed to retry episode:', e);
        } finally {
            const updated = new Set(retryingEpisodeIds);
            updated.delete(episode.id);
            retryingEpisodeIds = updated;
        }
    }

    function formatRuntime(minutes: number | null): string {
        if (!minutes) {
            return '';
        }
        if (minutes < 60) {
            return `${minutes}m`;
        }
        return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    }

    function formatDate(date: string | Date | null): string {
        if (!date) {
            return 'Unknown';
        }
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    }

    function formatFileSize(bytes: number | null): string {
        if (!bytes) {
            return 'Unknown';
        }
        if (bytes < 1024) {
            return `${bytes} B`;
        }
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }
        if (bytes < 1024 * 1024 * 1024) {
            return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        }
        return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    }

    async function handleDelete() {
        if (!media) {
            return;
        }

        confirmDelete(
            'Delete Show',
            'Are you sure you want to delete this show? This action cannot be undone.',
            async () => {
                deleting = true;
                try {
                    const res = await fetch(`/api/media/${media?.id}`, {
                        method: 'DELETE',
                    });
                    if (res.ok) {
                        goto('/');
                    }
                } catch (e) {
                    console.error('Failed to delete show:', e);
                } finally {
                    deleting = false;
                }
            }
        );
    }

    function getColorForCertification(cert: string | null): string {
        if (!cert) {
            return 'border-white/30 text-white';
        }
        switch (cert.toUpperCase()) {
            case 'TV-Y':
            case 'TV-G':
            case 'G':
                return 'bg-green-500/20 text-green-400 border-green-500/30';
            case 'TV-PG':
            case 'PG':
                return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            case 'TV-14':
            case 'PG-13':
                return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
            case 'TV-MA':
            case 'R':
            case 'NC-17':
                return 'bg-red-500/20 text-red-400 border-red-500/30';
            default:
                return 'border-white/30 text-white';
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
        allEpisodes.filter((episode) => episode.status === 'complete' || episode.filePath).length
    );
    const totalEpisodeSize = $derived(allEpisodes.reduce((sum, episode) => sum + (episode.fileSize ?? 0), 0));
    const showStatus = $derived.by(() => {
        if (allEpisodes.length === 0) {
            return 'pending';
        }
        if (allEpisodes.every((episode) => episode.status === 'complete' || episode.filePath)) {
            return 'complete';
        }
        if (allEpisodes.some((episode) => episode.status === 'downloading' || episode.status === 'searching')) {
            return 'downloading';
        }
        if (allEpisodes.some((episode) => episode.status === 'error' || episode.status === 'not_found')) {
            return 'error';
        }
        return 'pending';
    });

    $effect(() => {
        loadShow();
    });

    $effect(() => {
        const hasActiveEpisodes = allEpisodes.some(
            (episode) => episode.status === 'searching' || episode.status === 'downloading'
        );
        if (!hasActiveEpisodes) {
            return;
        }
        const interval = window.setInterval(() => {
            loadShow(false);
        }, 5000);
        return () => {
            window.clearInterval(interval);
        };
    });
</script>

<svelte:head>
    <title>{media?.title ?? 'Show'} | Plank</title>
</svelte:head>

{#if loading}
    <div class="flex items-center justify-center min-h-screen">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
{:else if media}
    <!-- Hero Section -->
    <div class="min-h-screen bg-background pb-12">
        <!-- Hero Section with Backdrop -->
        <div class="relative h-80 md:h-96 overflow-hidden">
            {#if media.backdropUrl || media.posterUrl}
                <img
                    src={media.backdropUrl || media.posterUrl}
                    alt={media.title}
                    class="absolute inset-0 w-full h-full object-cover"
                >
                <div class="absolute inset-0 bg-linear-to-t from-background via-background/80 to-transparent"></div>
            {:else}
                <div class="absolute inset-0 bg-linear-to-b from-accent/20 to-background"></div>
            {/if}

            <!-- Back Button -->
            <div class="fixed top-6 left-6 z-50">
                <Button
                    variant="ghost"
                    class="bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm"
                    onclick={() => window.history.back()}
                >
                    <ArrowLeft class="w-5 h-5 mr-2" />
                    Back
                </Button>
            </div>
        </div>

        <!-- Content -->
        <div class="container mx-auto px-4 -mt-40 relative z-10">
            <div class="flex flex-col md:flex-row gap-8">
                <!-- Poster -->
                <div class="shrink-0">
                    {#if media.posterUrl}
                        <img
                            src={media.posterUrl}
                            alt={media.title}
                            class="w-48 md:w-64 rounded-lg shadow-2xl border border-white/10"
                        >
                    {:else}
                        <div
                            class="w-48 md:w-64 aspect-2/3 rounded-lg bg-accent flex items-center justify-center border border-white/10"
                        >
                            <Film class="w-16 h-16 text-muted-foreground" />
                        </div>
                    {/if}
                </div>

                <!-- Details -->
                <div class="flex-1 space-y-6">
                    <!-- Title -->
                    <div>
                        <h1 class="text-3xl md:text-4xl font-bold text-white">{media.title}</h1>
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
                            <span class="px-3 py-1 rounded-full bg-accent text-muted-foreground">{media.year}</span>
                        {/if}
                        {#if media.runtime}
                            <span class="px-3 py-1 rounded-full bg-accent text-muted-foreground">
                                {formatRuntime(media.runtime)} avg
                            </span>
                        {/if}
                        {#if media.totalSeasons}
                            <span class="px-3 py-1 rounded-full bg-accent text-muted-foreground">
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
                                <span
                                    class="px-3 py-1 rounded-full border border-white/20 text-sm text-muted-foreground"
                                    >{genre}</span
                                >
                            {/each}
                        </div>
                    {/if}

                    <!-- Action Buttons -->
                    <div class="flex items-center gap-3 pt-4">
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
                        <div class="ml-2">
                            <h2 class="text-lg font-semibold text-white mb-1 mt-4">Overview</h2>
                            <p class="text-muted-foreground leading-relaxed">{media.overview}</p>
                        </div>
                    {/if}

                    <!-- Episode Selector (Moved here or kept below?) -->
                    <!-- We'll keep it in the main flow but styled appropriately -->
                </div>
            </div>

            <!-- Seasons & Episodes -->
            <div class="mt-8">
                <h2 class="text-2xl font-bold mb-6 text-white">Seasons & Episodes</h2>

                <!-- Season Tabs -->
                {#if seasons.length > 0}
                    <div class="flex gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
                        {#each seasons as season}
                            <Button
                                variant={selectedSeason === season.seasonNumber
                                    ? "default"
                                    : "ghost"}
                                onclick={() =>
                                    (selectedSeason = season.seasonNumber)}
                                class="whitespace-nowrap"
                            >
                                {season.name || `Season ${season.seasonNumber}`}
                            </Button>
                        {/each}
                    </div>

                    <!-- Episode List -->
                    {#if currentSeason}
                        <div class="space-y-4">
                            {#each currentSeason.episodes as episode}
                                <div
                                    class="flex gap-4 p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors group"
                                >
                                    <!-- Episode Thumbnail -->
                                    <div
                                        class="shrink-0 w-32 md:w-48 aspect-video rounded overflow-hidden bg-accent relative"
                                    >
                                        {#if episode.stillPath}
                                            <img
                                                src={episode.stillPath}
                                                alt={episode.title ??
                                                    `Episode ${episode.episodeNumber}`}
                                                class="w-full h-full object-cover"
                                            >
                                        {:else}
                                            <div
                                                class="w-full h-full flex items-center justify-center text-muted-foreground"
                                            >
                                                <Play class="w-8 h-8" />
                                            </div>
                                        {/if}
                                        <div
                                            class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[10px] {getEpisodeStatusClass(episode)}"
                                        >
                                            {getEpisodeStatusLabel(episode)}
                                        </div>
                                    </div>

                                    <!-- Episode Info -->
                                    <div class="flex-1 min-w-0 flex flex-col justify-between py-1">
                                        <div>
                                            <div class="flex items-start justify-between gap-4">
                                                <h3 class="font-semibold text-base md:text-lg line-clamp-1">
                                                    <span class="text-muted-foreground mr-1"
                                                        >{episode.episodeNumber}.</span
                                                    >
                                                    {episode.title ||
                                                        `Episode ${episode.episodeNumber}`}
                                                </h3>
                                            </div>

                                            <div
                                                class="flex items-center gap-3 text-xs md:text-sm text-muted-foreground mt-1"
                                            >
                                                {#if episode.runtime}
                                                    <span
                                                        >{formatRuntime(
                                                            episode.runtime,
                                                        )}</span
                                                    >
                                                {/if}
                                                {#if episode.airDate}
                                                    <span>• {episode.airDate}</span>
                                                {/if}
                                            </div>
                                        </div>

                                        <div class="flex items-center justify-between mt-2 md:mt-0">
                                            {#if episode.overview}
                                                <p
                                                    class="text-xs text-muted-foreground line-clamp-2 pr-4 hidden md:block"
                                                >
                                                    {episode.overview}
                                                </p>
                                            {/if}

                                            <div class="flex items-center gap-1 shrink-0 ml-auto">
                                                {#if episode.status === 'error' || episode.status === 'not_found'}
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={retryingEpisodeIds.has(episode.id)}
                                                        onclick={() => handleRetryEpisode(episode)}
                                                    >
                                                        <RotateCcw class="w-4 h-4 mr-1" />
                                                        {retryingEpisodeIds.has(episode.id)
                                                            ? 'Retrying'
                                                            : 'Retry'}
                                                    </Button>
                                                {/if}
                                                {#if media}
                                                    <SubtitleMenu
                                                        mediaId={episode.id}
                                                        onAddSubtitles={() => openSubtitlesForEpisode(episode)}
                                                        compact
                                                    />
                                                {/if}
                                                <Button
                                                    size="sm"
                                                    disabled={!canPlayEpisode(episode)}
                                                    onclick={() =>
                                                        handlePlayEpisode(episode)}
                                                >
                                                    <Play class="w-4 h-4 mr-1 fill-current" />
                                                    Play
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            {/each}

                            {#if currentSeason.episodes.length === 0}
                                <div class="text-center py-12 text-muted-foreground">
                                    No episodes available for this season
                                </div>
                            {/if}
                        </div>
                    {/if}
                {:else}
                    <div class="text-center py-12 text-muted-foreground">No seasons available</div>
                {/if}
            </div>
        </div>
    </div>

    <!-- Technical Details (Info Cards) -->
    <div class="container mx-auto px-4 pb-12">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
            <div class="bg-card border border-border rounded-lg p-6 space-y-4">
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

            <div class="bg-card border border-border rounded-lg p-6 space-y-4">
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
                        <span class="font-medium">{currentSeason?.name || `Season ${selectedSeason ?? 1}`}</span>
                    </div>
                </div>
            </div>

            <div class="bg-card border border-border rounded-lg p-6 space-y-4">
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

            <div class="bg-card border border-border rounded-lg p-6 space-y-4">
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

    <DeleteConfirmationModal
        bind:open={uiState.deleteConfirmation.open}
        title={uiState.deleteConfirmation.title}
        description={uiState.deleteConfirmation.description}
        onConfirm={uiState.deleteConfirmation.confirmAction}
        loading={deleting}
    />

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
