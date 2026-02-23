<script lang="ts">
    import { Check, Download, Ear, Globe, Loader, Search, Shield, Star } from '@lucide/svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import Dialog from '$lib/components/ui/Dialog.svelte';
    import { createDownloadSubtitleMutation } from '$lib/mutations/media-mutations';
    import { type OpenSubtitleSearchResult, searchOpenSubtitles } from '$lib/queries/media-queries';

    let {
        open = $bindable(false),
        mediaId,
        mediaTitle = '',
        episodeId,
        seasonNumber,
        episodeNumber,
    }: {
        open?: boolean;
        mediaId: string;
        mediaTitle?: string;
        episodeId?: string;
        seasonNumber?: number;
        episodeNumber?: number;
    } = $props();

    let results: OpenSubtitleSearchResult[] = $state([]);
    let searching = $state(false);
    let searchError = $state('');
    let selectedLanguages = $state('en');
    let downloadingIds = $state<Set<string>>(new Set());
    let downloadedIds = $state<Set<string>>(new Set());

    const downloadMutation = createDownloadSubtitleMutation();

    const LANGUAGES = [
        { code: 'en', name: 'English' },
        { code: 'es', name: 'Spanish' },
        { code: 'fr', name: 'French' },
        { code: 'de', name: 'German' },
        { code: 'it', name: 'Italian' },
        { code: 'pt', name: 'Portuguese' },
        { code: 'ja', name: 'Japanese' },
        { code: 'ko', name: 'Korean' },
        { code: 'zh', name: 'Chinese' },
        { code: 'ar', name: 'Arabic' },
        { code: 'ru', name: 'Russian' },
        { code: 'hi', name: 'Hindi' },
        { code: 'pl', name: 'Polish' },
        { code: 'tr', name: 'Turkish' },
        { code: 'nl', name: 'Dutch' },
        { code: 'sv', name: 'Swedish' },
        { code: 'no', name: 'Norwegian' },
        { code: 'da', name: 'Danish' },
        { code: 'fi', name: 'Finnish' },
        { code: 'cs', name: 'Czech' },
        { code: 'ro', name: 'Romanian' },
        { code: 'hu', name: 'Hungarian' },
        { code: 'el', name: 'Greek' },
        { code: 'he', name: 'Hebrew' },
        { code: 'th', name: 'Thai' },
        { code: 'vi', name: 'Vietnamese' },
        { code: 'id', name: 'Indonesian' },
        { code: 'uk', name: 'Ukrainian' },
        { code: 'bg', name: 'Bulgarian' },
        { code: 'hr', name: 'Croatian' },
    ];

    async function performSearch() {
        searching = true;
        searchError = '';
        results = [];

        try {
            results = await searchOpenSubtitles(mediaId, {
                languages: selectedLanguages,
                seasonNumber,
                episodeNumber,
            });
        } catch (err) {
            searchError = err instanceof Error ? err.message : 'Search failed';
        } finally {
            searching = false;
        }
    }

    async function handleDownload(result: OpenSubtitleSearchResult) {
        if (downloadingIds.has(result.id) || downloadedIds.has(result.id)) {
            return;
        }

        downloadingIds = new Set([...downloadingIds, result.id]);

        try {
            await downloadMutation.mutateAsync({
                mediaId,
                fileId: result.fileId,
                language: result.language,
                episodeId,
            });
            downloadedIds = new Set([...downloadedIds, result.id]);
        } catch {
            // Error handled by mutation
        } finally {
            const next = new Set(downloadingIds);
            next.delete(result.id);
            downloadingIds = next;
        }
    }

    function formatDownloadCount(count: number): string {
        if (count >= 1_000_000) {
            return `${(count / 1_000_000).toFixed(1)}M`;
        }
        if (count >= 1000) {
            return `${(count / 1000).toFixed(1)}K`;
        }
        return String(count);
    }

    function toggleLanguage(code: string) {
        const langs = selectedLanguages ? selectedLanguages.split(',') : [];
        const index = langs.indexOf(code);
        if (index >= 0) {
            langs.splice(index, 1);
        } else {
            langs.push(code);
        }
        selectedLanguages = langs.join(',');
    }

    function isLanguageSelected(code: string): boolean {
        return selectedLanguages.split(',').includes(code);
    }

    let showLanguageFilter = $state(false);

    // Auto-search when dialog opens
    $effect(() => {
        if (open) {
            downloadedIds = new Set();
            performSearch();
        }
    });
</script>

<Dialog bind:open title="Search Subtitles" description="Find subtitles for {mediaTitle}" class="w-2xl">
    <div class="space-y-4 mt-2">
        <!-- Language filter toggle + search -->
        <div class="flex items-center gap-2">
            <Button
                variant={showLanguageFilter ? "default" : "outline"}
                size="sm"
                onclick={() => (showLanguageFilter = !showLanguageFilter)}
            >
                <Globe class="w-4 h-4 mr-1" />
                Languages
            </Button>

            <Button size="sm" onclick={performSearch} disabled={searching}>
                {#if searching}
                    <Loader class="w-4 h-4 mr-1 animate-spin" />
                    Searching...
                {:else}
                    <Search class="w-4 h-4 mr-1" />
                    Search
                {/if}
            </Button>
        </div>

        <!-- Language chips -->
        {#if showLanguageFilter}
            <div class="flex flex-wrap gap-1.5 p-3 bg-accent/30 rounded-lg border border-border">
                {#each LANGUAGES as lang}
                    <button
                        class="px-2.5 py-1 text-xs rounded-full border transition-colors {isLanguageSelected(
                            lang.code,
                        )
                            ? 'bg-primary/20 border-primary/50 text-primary'
                            : 'border-border text-muted-foreground hover:border-white/30 hover:text-white'}"
                        onclick={() => toggleLanguage(lang.code)}
                    >
                        {lang.name}
                    </button>
                {/each}
            </div>
        {/if}

        <!-- Error state -->
        {#if searchError}
            <div class="px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                {searchError}
            </div>
        {/if}

        <!-- Results -->
        <div class="max-h-96 overflow-y-auto space-y-1 -mx-2 px-2">
            {#if searching}
                <div class="flex items-center justify-center py-12">
                    <Loader class="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            {:else if results.length === 0 && !searchError}
                <div class="text-center py-12 text-muted-foreground text-sm">
                    No subtitles found. Try different languages.
                </div>
            {:else}
                {#each results as result (result.id)}
                    <div
                        class="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:border-border transition-colors bg-card/50"
                    >
                        <!-- Main info -->
                        <div class="flex-1 min-w-0 space-y-1.5">
                            <!-- Title line with tags -->
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="text-sm font-medium text-white truncate"> {result.languageName} </span>

                                {#if result.isExactMatch}
                                    <span
                                        class="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 font-medium"
                                    >
                                        Exact Match
                                    </span>
                                {/if}

                                {#if result.hearingImpaired}
                                    <span
                                        class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400"
                                        title="Hearing Impaired"
                                    >
                                        <Ear class="w-3 h-3 inline-block" /> HI
                                    </span>
                                {/if}

                                {#if result.fromTrusted}
                                    <span
                                        class="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400"
                                        title="Trusted uploader"
                                    >
                                        <Shield class="w-3 h-3 inline-block" /> Trusted
                                    </span>
                                {/if}

                                {#if result.aiTranslated}
                                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                                        AI
                                    </span>
                                {/if}
                            </div>

                            <!-- Release name -->
                            <p class="text-xs text-muted-foreground truncate" title={result.release}>
                                {result.release || result.fileName}
                            </p>

                            <!-- Stats line -->
                            <div class="flex items-center gap-3 text-[11px] text-muted-foreground">
                                <span class="flex items-center gap-1">
                                    <Download class="w-3 h-3" />
                                    {formatDownloadCount(result.downloadCount)}
                                </span>
                                {#if result.ratings > 0}
                                    <span class="flex items-center gap-1">
                                        <Star class="w-3 h-3" />
                                        {result.ratings.toFixed(1)}
                                    </span>
                                {/if}
                                {#if result.fps > 0}
                                    <span>{result.fps} fps</span>
                                {/if}
                            </div>
                        </div>

                        <!-- Download button -->
                        <div class="shrink-0 pt-1">
                            {#if downloadedIds.has(result.id)}
                                <Button variant="ghost" size="icon" class="h-8 w-8 text-green-400" disabled>
                                    <Check class="w-4 h-4" />
                                </Button>
                            {:else if downloadingIds.has(result.id)}
                                <Button variant="ghost" size="icon" class="h-8 w-8" disabled>
                                    <Loader class="w-4 h-4 animate-spin" />
                                </Button>
                            {:else}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-8 w-8 text-muted-foreground hover:text-white"
                                    onclick={() => handleDownload(result)}
                                >
                                    <Download class="w-4 h-4" />
                                </Button>
                            {/if}
                        </div>
                    </div>
                {/each}
            {/if}
        </div>
    </div>
</Dialog>
