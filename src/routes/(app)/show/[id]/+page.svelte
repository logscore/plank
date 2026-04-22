<script lang="ts">
    import { ArrowLeft, Calendar, Database, EllipsisVertical, Film, Play, RotateCcw, Trash2 } from '@lucide/svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import DeleteConfirmationModal from '$lib/components/DeleteConfirmationModal.svelte';
    import EpisodeSelector from '$lib/components/EpisodeSelector.svelte';
    import OpenSubtitlesDialog from '$lib/components/OpenSubtitlesDialog.svelte';
    import SubtitleMenu from '$lib/components/SubtitleMenu.svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import Dialog from '$lib/components/ui/Dialog.svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import { canPlayEpisode } from '$lib/media-playability';
    import type { Media, SeasonWithEpisodes } from '$lib/types';
    import { confirmDelete, uiState } from '$lib/ui-state.svelte';

    let media: Media | null = $state(null);
    let seasons: SeasonWithEpisodes[] = $state([]);
    let loading = $state(true);
    let selectedSeason = $state<number | null>(null);
    let deleting = $state(false);
    let retryingEpisodeIds = $state<Set<string>>(new Set());
    let activeEpisodeMenuId = $state<string | null>(null);
    let redownloadDialogOpen = $state(false);
    let selectedEpisode = $state<Media | null>(null);
    let retryDialogError = $state('');
    let manualSourceInput = $state('');
    // OpenSubtitles dialog state
    let openSubtitlesDialogOpen = $state(false);
    let subtitleDialogMediaId = $state<string | undefined>(undefined);
    let subtitleDialogSeasonNumber = $state<number | undefined>(undefined);
    let subtitleDialogEpisodeNumber = $state<number | null>(null);
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
                const nextSeasons = (await seasonsRes.json()) as SeasonWithEpisodes[];
                seasons = nextSeasons;

                if (nextSeasons.length === 0) {
                    selectedSeason = null;
                } else if (
                    selectedSeason === null ||
                    !nextSeasons.some((season) => season.seasonNumber === selectedSeason)
                ) {
                    selectedSeason = nextSeasons[0].seasonNumber;
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

    function isEpisodeRemoved(episode: Media): boolean {
        return episode.status === 'removed';
    }

    function getEpisodeStatusLabel(episode: Media): string {
        if (episode.status === 'complete' || episode.filePath) {
            return 'Downloaded';
        }
        if (episode.status === 'removed') {
            return 'Removed';
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
            return 'bg-emerald-500 text-emerald-100';
        }
        if (episode.status === 'removed') {
            return 'bg-rose-500 text-rose-100';
        }
        if (episode.status === 'downloading') {
            return 'bg-blue-500 text-blue-100';
        }
        if (episode.status === 'searching') {
            return 'bg-amber-500 text-amber-100';
        }
        if (episode.status === 'not_found' || episode.status === 'error') {
            return 'bg-red-500 text-red-100';
        }
        return 'bg-muted text-muted-foreground';
    }

    function getEpisodeCardClass(episode: Media): string {
        return isEpisodeRemoved(episode) ? 'border-rose-500/40 bg-rose-500/5' : 'border-border hover:border-primary/50';
    }

    function openRedownloadDialog(episode: Media) {
        activeEpisodeMenuId = null;
        selectedEpisode = episode;
        redownloadDialogOpen = true;
        retryDialogError = '';
        manualSourceInput = '';
    }

    function closeRedownloadDialog() {
        redownloadDialogOpen = false;
        selectedEpisode = null;
        retryDialogError = '';
        manualSourceInput = '';
    }

    function toggleEpisodeMenu(episodeId: string, event: Event) {
        event.stopPropagation();
        activeEpisodeMenuId = activeEpisodeMenuId === episodeId ? null : episodeId;
    }

    function closeEpisodeMenu(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.episode-actions-menu')) {
            activeEpisodeMenuId = null;
        }
    }

    async function runEpisodeRetry(
        episode: Media,
        body?: { mode?: 'same' | 'replace' | 'remove'; magnetLink?: string }
    ) {
        if (retryingEpisodeIds.has(episode.id)) {
            return false;
        }

        retryingEpisodeIds = new Set(retryingEpisodeIds).add(episode.id);
        retryDialogError = '';
        try {
            const response = await fetch(`/api/media/${episode.id}/retry`, {
                method: 'POST',
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
                body: body ? JSON.stringify(body) : undefined,
            });
            const result = (await response.json().catch(() => null)) as {
                message?: string;
            } | null;
            if (!response.ok) {
                throw new Error(result?.message || 'Episode action failed');
            }
            await loadShow(false);
            return true;
        } catch (error) {
            console.error('Failed to run episode retry action:', error);
            retryDialogError = error instanceof Error ? error.message : 'Episode action failed';
            return false;
        } finally {
            const updated = new Set(retryingEpisodeIds);
            updated.delete(episode.id);
            retryingEpisodeIds = updated;
        }
    }

    async function handleRetryCurrentSource() {
        if (!selectedEpisode) {
            return;
        }
        const success = await runEpisodeRetry(selectedEpisode, {
            mode: 'same',
        });
        if (success) {
            closeRedownloadDialog();
        }
    }

    async function handleManualSourceSubmit() {
        if (!(selectedEpisode && manualSourceInput.trim())) {
            return;
        }
        const success = await runEpisodeRetry(selectedEpisode, {
            mode: 'replace',
            magnetLink: manualSourceInput.trim(),
        });
        if (success) {
            closeRedownloadDialog();
        }
    }

    function handleRemoveEpisodeDownload(episode: Media) {
        activeEpisodeMenuId = null;
        confirmDelete(
            'Remove Episode Download',
            'This removes the downloaded file but keeps the episode metadata so you can redownload it later.',
            async () => {
                await runEpisodeRetry(episode, { mode: 'remove' });
            }
        );
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

<svelte:document onclick={closeEpisodeMenu} />

<svelte:head>
    <title>{media?.title ?? "Show"} | Plank</title>
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
                                {formatRuntime(media.runtime)}
                                avg
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
                                    class="flex gap-4 p-4 bg-card rounded-lg border transition-colors group {getEpisodeCardClass(
                                        episode,
                                    )}"
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
                                            class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[10px] {getEpisodeStatusClass(
                                                episode,
                                            )}"
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
                                                {#if media}
                                                    <SubtitleMenu
                                                        mediaId={episode.id}
                                                        onAddSubtitles={() =>
                                                            openSubtitlesForEpisode(
                                                                episode,
                                                            )}
                                                        compact
                                                    />
                                                {/if}
                                                <Button
                                                    size="sm"
                                                    disabled={!canPlayEpisode(
                                                        episode,
                                                    )}
                                                    onclick={() =>
                                                        handlePlayEpisode(
                                                            episode,
                                                        )}
                                                >
                                                    <Play class="w-4 h-4 mr-1 fill-current" />
                                                    Play
                                                </Button>
                                                <div class="relative episode-actions-menu">
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        class="text-white hover:bg-neutral-800"
                                                        onclick={(event) =>
                                                            toggleEpisodeMenu(
                                                                episode.id,
                                                                event,
                                                            )}
                                                        title="Episode actions"
                                                    >
                                                        <EllipsisVertical class="w-4 h-4" />
                                                    </Button>

                                                    {#if activeEpisodeMenuId === episode.id}
                                                        <div
                                                            class="absolute right-0 top-full mt-2 w-44 rounded-md shadow-lg bg-black/95 border border-white/10 ring-1 ring-black/40 backdrop-blur-md overflow-hidden z-50"
                                                        >
                                                            <div class="py-1" role="menu">
                                                                <button
                                                                    class="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10 flex items-center gap-2"
                                                                    role="menuitem"
                                                                    disabled={retryingEpisodeIds.has(
                                                                        episode.id,
                                                                    )}
                                                                    onclick={() =>
                                                                        openRedownloadDialog(
                                                                            episode,
                                                                        )}
                                                                >
                                                                    <RotateCcw class="w-4 h-4" />
                                                                    {retryingEpisodeIds.has(
                                                                        episode.id,
                                                                    )
                                                                        ? "Working..."
                                                                        : "Redownload"}
                                                                </button>
                                                                <button
                                                                    class="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-white/10 flex items-center gap-2 disabled:opacity-50"
                                                                    role="menuitem"
                                                                    disabled={retryingEpisodeIds.has(
                                                                        episode.id,
                                                                    ) ||
                                                                        isEpisodeRemoved(
                                                                            episode,
                                                                        )}
                                                                    onclick={() =>
                                                                        handleRemoveEpisodeDownload(
                                                                            episode,
                                                                        )}
                                                                >
                                                                    <Trash2 class="w-4 h-4" />
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </div>
                                                    {/if}
                                                </div>
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
                        <span class="font-medium"
                            >{currentSeason?.name ||
                                `Season ${selectedSeason ?? 1}`}</span
                        >
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

    <Dialog
        bind:open={redownloadDialogOpen}
        title={selectedEpisode
            ? `Redownload ${selectedEpisode.title || `Episode ${selectedEpisode.episodeNumber}`}`
            : "Redownload Episode"}
        description="Reuse the saved source or paste a magnet link or torrent URL manually."
        class="max-w-xl"
    >
        <div class="space-y-5">
            <div class="space-y-3">
                <div class="space-y-1">
                    <p class="text-sm font-medium">Saved source</p>
                    <p class="text-sm text-muted-foreground">Retry the source already stored on this episode.</p>
                </div>
                <Button
                    onclick={handleRetryCurrentSource}
                    disabled={!selectedEpisode ||
                        !selectedEpisode.magnetLink ||
                        retryingEpisodeIds.has(selectedEpisode.id)}
                >
                    <RotateCcw class="w-4 h-4 mr-2" />
                    Retry saved source
                </Button>
                {#if selectedEpisode && !selectedEpisode.magnetLink}
                    <p class="text-sm text-muted-foreground">
                        This episode does not have a saved source yet. Paste a new one below.
                    </p>
                {/if}
            </div>

            <div class="space-y-3 border-t border-border pt-4">
                <div class="space-y-1">
                    <p class="text-sm font-medium">Manual source</p>
                    <p class="text-sm text-muted-foreground">Paste a magnet link or a direct torrent URL.</p>
                </div>
                <Input
                    bind:value={manualSourceInput}
                    placeholder="magnet:?xt=urn:btih:... or https://..."
                    onkeydown={(event) =>
                        event.key === "Enter" && handleManualSourceSubmit()}
                />
                <div class="flex justify-end">
                    <Button
                        onclick={handleManualSourceSubmit}
                        disabled={!selectedEpisode ||
                            retryingEpisodeIds.has(selectedEpisode.id) ||
                            !manualSourceInput.trim()}
                    >
                        Use manual source
                    </Button>
                </div>
            </div>

            {#if retryDialogError}
                <p class="text-sm text-destructive">{retryDialogError}</p>
            {/if}
        </div>
    </Dialog>

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
