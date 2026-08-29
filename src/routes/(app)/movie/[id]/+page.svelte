<script lang="ts">
    import {
        ArrowLeft,
        Calendar,
        Check,
        Copy,
        Database,
        Film,
        Folder,
        Play,
        RefreshCw,
        RotateCcw,
        Trash2,
    } from "@lucide/svelte";
    import { onDestroy, onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { connectMediaProgressStream } from "$lib/client/media-progress-stream";
    import OpenSubtitlesDialog from "$lib/components/OpenSubtitlesDialog.svelte";
    import SubtitleMenu from "$lib/components/SubtitleMenu.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import Dialog from "$lib/components/ui/Dialog.svelte";
    import Input from "$lib/components/ui/Input.svelte";
    import Tip from "$lib/components/ui/Tip.svelte";
    import { createDeleteMediaMutation, createRetryMediaMutation } from "$lib/data/media";
    import { confirmDelete } from "$lib/ui-state.svelte";
    import { formatFileSize, isTerminalProgressStatus } from "$lib/utils";
    import type { PageData } from "./$types";

    let { data } = $props<{ data: PageData }>();
    let deleting = $state(false);
    let retrying = $state(false);
    let copied = $state(false);
    let redownloadDialogOpen = $state(false);
    let retryError = $state("");
    let manualSourceInput = $state("");

    // Mutations
    const deleteMediaMutation = createDeleteMediaMutation();
    const retryMediaMutation = createRetryMediaMutation();

    // OpenSubtitles Dialog state
    let openSubtitlesDialogOpen = $state(false);

    // Live stats (updated via SSE)
    let liveStatus = $state<string | null>(null);
    let liveProgress = $state<number | null>(null);
    let downloadSpeed = $state(0);
    let peers = $state(0);
    let liveFileSize = $state<number | null>(null);

    // Sync initial values from data when component mounts or data changes
    $effect(() => {
        liveStatus = data.progress?.status ?? data.media.status;
        liveProgress = data.progress?.progress ?? data.media.progress;
        downloadSpeed = data.progress?.downloadSpeed ?? 0;
        peers = data.progress?.peers ?? 0;
        liveFileSize = data.progress?.fileSize ?? data.media.fileSize;
    });

    const fileSizeLabel = $derived.by(() => {
        const bytes = liveFileSize ?? data.media.fileSize;
        return bytes ? formatFileSize(bytes) : "Unknown";
    });

    function formatSpeed(bytesPerSecond: number): string {
        if (bytesPerSecond < 1024) {
            return `${bytesPerSecond} B/s`;
        }
        if (bytesPerSecond < 1024 * 1024) {
            return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
        }
        return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
    }

    function formatDate(date: Date | null): string {
        if (!date) {
            return "Unknown";
        }
        return new Date(date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    async function copyFilePath() {
        if (!data.media.filePath) {
            return;
        }
        try {
            await navigator.clipboard.writeText(data.media.filePath);
            copied = true;
            setTimeout(() => {
                copied = false;
            }, 2000);
        } catch (err) {
            console.error("Failed to copy text: ", err);
        }
    }

    let stopProgressStream: (() => void) | null = null;

    function startStream() {
        if (stopProgressStream) {
            return;
        }
        stopProgressStream = connectMediaProgressStream(
            data.media.id,
            (info) => {
                liveStatus = info.status;
                liveProgress = info.progress;
                downloadSpeed = info.downloadSpeed || 0;
                peers = info.peers || 0;
                if (info.fileSize) {
                    liveFileSize = info.fileSize;
                }
            },
            () => {
                stopProgressStream = null;
            }
        );
    }

    function getColorForCertification(cert: string | null): string {
        if (!cert) {
            return "border-white/30 text-white";
        }
        switch (cert.toUpperCase()) {
            case "G":
                return "bg-green-500/20 text-green-400 border-green-500/30";
            case "PG":
                return "bg-blue-500/20 text-blue-400 border-blue-500/30";
            case "PG-13":
                return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
            case "R":
                return "bg-red-500/20 text-red-400 border-red-500/30";
            case "NC-17":
                return "bg-red-900/20 text-red-600 border-red-900/30";
            default:
                return "border-white/30 text-white";
        }
    }

    function stopStream() {
        if (stopProgressStream) {
            stopProgressStream();
            stopProgressStream = null;
        }
    }

    onMount(() => {
        // Only stream if not complete
        if (!isTerminalProgressStatus(data.progress?.status ?? data.media.status)) {
            startStream();
        }
    });

    onDestroy(() => {
        stopStream();
    });

    function openRedownloadDialog() {
        retryError = "";
        manualSourceInput = "";
        redownloadDialogOpen = true;
    }

    function closeRedownloadDialog() {
        redownloadDialogOpen = false;
        retryError = "";
        manualSourceInput = "";
    }

    async function runMovieRetry(body?: { mode?: "same" | "replace"; magnetLink?: string }) {
        retrying = true;
        retryError = "";
        try {
            await retryMediaMutation.mutateAsync({
                id: data.media.id,
                mode: body?.mode,
                magnetLink: body?.magnetLink,
            });
            if (body?.mode === "replace" && body.magnetLink) {
                data = {
                    ...data,
                    media: {
                        ...data.media,
                        magnetLink: body.magnetLink,
                    },
                };
            }
            liveStatus = "pending";
            liveProgress = 0;
            downloadSpeed = 0;
            peers = 0;
            liveFileSize = null;
            stopStream();
            startStream();
            return true;
        } catch (error) {
            console.error("Failed to retry download:", error);
            retryError = error instanceof Error ? error.message : "Failed to retry download";
            return false;
        } finally {
            retrying = false;
        }
    }

    async function handleRetryCurrentSource() {
        const success = await runMovieRetry({ mode: "same" });
        if (success) {
            closeRedownloadDialog();
        }
    }

    async function handleManualSourceSubmit() {
        if (!manualSourceInput.trim()) {
            return;
        }
        const success = await runMovieRetry({
            mode: "replace",
            magnetLink: manualSourceInput.trim(),
        });
        if (success) {
            closeRedownloadDialog();
        }
    }

    async function handleDelete() {
        confirmDelete(
            "Delete Media",
            "Are you sure you want to delete this? This action cannot be undone.",
            async () => {
                deleting = true;
                try {
                    await deleteMediaMutation.mutateAsync(data.media.id);
                    goto("/");
                } catch (e) {
                    console.error("Failed to delete media:", e);
                } finally {
                    deleting = false;
                }
            }
        );
    }
</script>

<svelte:head>
    <title>{data.media.title} | Plank</title>
</svelte:head>

<div class="relative min-h-screen overflow-hidden">
    <!-- Hero Section with Backdrop -->
    {#if data.media.backdropUrl || data.media.posterUrl}
        <picture>
            {#if data.media.backdropUrl}
                <source media="(min-width: 1024px)" srcset={data.media.backdropUrl}>
            {/if}
            <img
                src={data.media.posterUrl ?? data.media.backdropUrl}
                alt={data.media.title}
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
        <div class="grid gap-8 lg:grid-cols-[320px_1fr] lg:items-end">
            <!-- Poster -->
            <div class="hidden overflow-hidden rounded-2xl border border-white/10 shadow-2xl lg:block">
                {#if data.media.posterUrl}
                    <img src={data.media.posterUrl} alt={data.media.title} class="w-full object-cover">
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
                    <h1 class="text-4xl font-semibold tracking-tight text-white sm:text-5xl">{data.media.title}</h1>
                </div>

                <!-- Meta Badges -->
                <div class="flex flex-wrap items-center gap-3 text-sm">
                    {#if data.media.certification}
                        <span
                            class="px-3 py-1 rounded-full border font-bold {getColorForCertification(
                                data.media.certification,
                            )}"
                        >
                            {data.media.certification}
                        </span>
                    {/if}
                    {#if data.media.year}
                        <span class="rounded-full border border-white/15 px-3 py-1 text-muted-foreground"
                            >{data.media.year}</span
                        >
                    {/if}
                    {#if data.media.runtime}
                        <span class="rounded-full border border-white/15 px-3 py-1 text-muted-foreground">
                            {Math.floor(data.media.runtime / 60)}h
                            {data.media
                                .runtime % 60}
                            m
                        </span>
                    {/if}
                    {#if data.media.originalLanguage}
                        <span class="rounded-full border border-white/15 px-3 py-1 text-muted-foreground uppercase">
                            {data.media.originalLanguage}
                        </span>
                    {/if}
                </div>

                <!-- Genres -->
                {#if data.media.genres}
                    {@const genreList = JSON.parse(
                        data.media.genres,
                    ) as string[]}
                    <div class="flex flex-wrap gap-2">
                        {#each genreList as genre}
                            <span class="rounded-full bg-white/5 px-3 py-1 text-sm text-zinc-300">{genre}</span>
                        {/each}
                    </div>
                {/if}

                <!-- Action Buttons -->
                <div class="flex flex-wrap items-center gap-3">
                    {#if liveStatus === "error"}
                        <Button size="lg" class="px-8 bg-yellow-600 hover:bg-yellow-500" onclick={openRedownloadDialog}>
                            <RotateCcw class="w-5 h-5 mr-2" />
                            Redownload
                        </Button>
                    {:else}
                        <a href="/watch/{data.media.id}">
                            <Button size="lg" class="px-8">
                                <Play class="w-5 h-5 mr-2 fill-current" />
                                Play
                            </Button>
                        </a>
                    {/if}
                    <SubtitleMenu
                        mediaId={data.media.id}
                        tracks={data.subtitleTracks}
                        onAddSubtitles={() => (openSubtitlesDialogOpen = true)}
                    />
                    <Button
                        variant="ghost"
                        size="lg"
                        class="text-white  hover:bg-neutral-800"
                        onclick={handleDelete}
                        disabled={deleting}
                    >
                        <Trash2 class="w-5 h-5 mr-2" />
                        {deleting ? "Deleting..." : "Delete"}
                    </Button>
                </div>

                <!-- Overview -->
                {#if data.media.overview}
                    <div>
                        <h2 class="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Overview
                        </h2>
                        <p class="max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base">{data.media.overview}</p>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Technical Details -->
        <div class="mt-12 grid grid-cols-1 gap-4 pb-12 md:grid-cols-2">
            <div class="space-y-4 rounded-2xl border border-white/10 bg-card/70 p-5">
                <div class="flex items-center justify-between">
                    <h3 class="text-lg font-semibold flex items-center gap-2">
                        <Database class="w-5 h-5 text-primary" />
                        File Information
                    </h3>
                    {#if liveStatus !== "error" && liveStatus !== "downloading"}
                        <Tip text="Redownload Content">
                            {#snippet children(tipProps)}
                                <Button
                                    {...tipProps}
                                    variant="ghost"
                                    size="sm"
                                    class="h-8 w-8 p-0 text-muted-foreground hover:text-white"
                                    onclick={openRedownloadDialog}
                                    aria-label="Redownload Content"
                                >
                                    <RefreshCw class="w-4 h-4" />
                                </Button>
                            {/snippet}
                        </Tip>
                    {/if}
                </div>
                <div class="space-y-3 text-sm">
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">Status</span>
                        <span
                            class="capitalize font-medium {liveStatus ===
                            'complete'
                                ? 'text-green-400'
                                : liveStatus === 'downloading'
                                  ? 'text-yellow-400'
                                  : 'text-muted-foreground'}"
                            >{liveStatus}</span
                        >
                    </div>
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">Progress</span>
                        <span class="font-medium">{((liveProgress ?? 0) * 100).toFixed(1)}%</span>
                    </div>
                    {#if liveStatus === "downloading"}
                        <div class="flex justify-between">
                            <span class="text-muted-foreground">Download Speed</span>
                            <span class="font-medium text-blue-400">{formatSpeed(downloadSpeed)}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-muted-foreground">Peers</span>
                            <span class="font-medium text-green-400">{peers}</span>
                        </div>
                    {/if}
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">File Size</span>
                        <span class="font-medium">{fileSizeLabel}</span>
                    </div>
                </div>
            </div>

            <div class="space-y-4 rounded-2xl border border-white/10 bg-card/70 p-5">
                <h3 class="text-lg font-semibold flex items-center gap-2">
                    <Folder class="w-5 h-5 text-primary" />
                    Storage
                </h3>
                <div class="space-y-3 text-sm">
                    <div>
                        <span class="text-muted-foreground block mb-1">File Path</span>
                        <div class="flex items-center gap-2 relative overflow-hidden group">
                            <div class="relative flex-1 overflow-hidden">
                                <code
                                    class="text-xs bg-accent px-2 py-1 rounded whitespace-nowrap overflow-x-auto block w-full no-scrollbar pr-6"
                                >
                                    {data.media.filePath ||
                                        "Not yet downloaded"}
                                </code>
                                <!-- Fade/Blur effect on the right -->
                                <div
                                    class="absolute top-0 right-0 bottom-0 w-8 bg-linear-to-l from-accent to-transparent pointer-events-none"
                                ></div>
                            </div>
                            {#if data.media.filePath}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-6 w-6 shrink-0 bg-background/50 backdrop-blur-sm"
                                    onclick={copyFilePath}
                                >
                                    {#if copied}
                                        <Check class="h-3 w-3 text-green-500" />
                                    {:else}
                                        <Copy class="h-3 w-3" />
                                    {/if}
                                </Button>
                            {/if}
                        </div>
                    </div>
                    <div>
                        <span class="text-muted-foreground block mb-1">Infohash</span>
                        <code class="text-xs bg-accent px-2 py-1 rounded break-all block">{data.media.infohash}</code>
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
                        <span class="font-medium">{formatDate(data.media.addedAt)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">Last Played</span>
                        <span class="font-medium"
                            >{data.media.lastPlayedAt
                                ? formatDate(data.media.lastPlayedAt)
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
                        <span class="font-medium">{data.media.tmdbId || "Not linked"}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">Media ID</span>
                        <code class="text-xs bg-accent px-2 py-1 rounded">{data.media.id}</code>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<Dialog
    bind:open={redownloadDialogOpen}
    title={`Redownload ${data.media.title}`}
    description="Reuse the saved source or paste a magnet link or torrent URL manually."
>
    <div class="space-y-5 py-1">
        <div class="space-y-3">
            <div class="space-y-1">
                <p class="text-sm font-medium">Saved source</p>
                <p class="text-sm text-muted-foreground">Retry the source already stored on this movie.</p>
            </div>
            <Button onclick={handleRetryCurrentSource} disabled={!data.media.magnetLink || retrying}>
                <RotateCcw class="w-4 h-4 mr-2" />
                {retrying ? "Retrying..." : "Retry saved source"}
            </Button>
            {#if !data.media.magnetLink}
                <p class="text-sm text-muted-foreground">
                    This movie does not have a saved source yet. Paste a new one below.
                </p>
            {/if}
        </div>

        <div class="space-y-3 border-t border-border pt-4">
            <div class="space-y-1">
                <p class="text-sm font-medium">Manual source</p>
                <p class="text-sm text-muted-foreground">Paste a magnet link or a direct torrent URL.</p>
            </div>
            <Input
                placeholder="magnet:?xt=urn:btih:... or https://..."
                bind:value={manualSourceInput}
                onkeydown={(event) =>
                    event.key === "Enter" && handleManualSourceSubmit()}
            />
            <div class="flex justify-end gap-2">
                <Button variant="ghost" onclick={closeRedownloadDialog}>Cancel</Button>
                <Button onclick={handleManualSourceSubmit} disabled={retrying || !manualSourceInput.trim()}>
                    {retrying ? "Starting..." : "Use manual source"}
                </Button>
            </div>
        </div>

        {#if retryError}
            <p class="text-sm text-destructive">{retryError}</p>
        {/if}
    </div>
</Dialog>

<OpenSubtitlesDialog bind:open={openSubtitlesDialogOpen} mediaId={data.media.id} mediaTitle={data.media.title} />
