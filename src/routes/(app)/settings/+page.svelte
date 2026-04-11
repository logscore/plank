<script lang="ts">
    import { Captions, Check, ChevronDown, Film, Loader2, PlugZap, Save, Server, Unplug, X } from '@lucide/svelte';
    import { toast } from 'svelte-sonner';
    import { enhance } from '$app/forms';
    import IndexerManager from '$lib/components/IndexerManager.svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import type { ActionData, PageData } from './$types';

    interface SectionLink {
        id: string;
        label: string;
        description: string;
    }

    let { data, form } = $props<{ data: PageData; form?: ActionData }>();

    let formElement = $state<HTMLFormElement | null>(null);
    let saving = $state(false);
    let tmdbApiKey = $state('');
    let prowlarrUrl = $state('');
    let prowlarrApiKey = $state('');
    let opensubtitlesApiKey = $state('');
    let opensubtitlesUsername = $state('');
    let opensubtitlesPassword = $state('');
    let indexerManagementOpen = $state(false);
    let connectionStates = $state({
        tmdb: 'idle',
        opensubtitles: 'idle',
        prowlarr: 'idle',
    });
    let connectionMessages = $state({
        tmdb: '',
        opensubtitles: '',
        prowlarr: '',
    });

    const sectionLinks: SectionLink[] = [
        { id: 'tmdb', label: 'TMDB', description: 'Metadata and artwork' },
        { id: 'opensubtitles', label: 'OpenSubtitles', description: 'Subtitle search' },
        { id: 'prowlarr', label: 'Prowlarr', description: 'Indexers and discovery' },
    ];

    function getStatusIconClass(status: string): string {
        if (status === 'success') {
            return 'text-green-600 dark:text-green-500';
        }
        if (status === 'error') {
            return 'text-destructive';
        }
        return 'text-muted-foreground';
    }

    function buildTestConnectionRequestBody(target: 'tmdb' | 'opensubtitles' | 'prowlarr'): Record<string, string> {
        if (!formElement) {
            return { target };
        }
        const formData = new FormData(formElement);
        return {
            target,
            tmdbApiKey: formData.get('tmdbApiKey')?.toString() || '',
            prowlarrUrl: formData.get('prowlarrUrl')?.toString() || '',
            prowlarrApiKey: formData.get('prowlarrApiKey')?.toString() || '',
            opensubtitlesApiKey: formData.get('opensubtitlesApiKey')?.toString() || '',
            opensubtitlesUsername: formData.get('opensubtitlesUsername')?.toString() || '',
            opensubtitlesPassword: formData.get('opensubtitlesPassword')?.toString() || '',
        };
    }

    function applyConnectionResult(
        target: 'tmdb' | 'opensubtitles' | 'prowlarr',
        success: boolean,
        message: string,
        showToast: boolean
    ): void {
        connectionStates[target] = success ? 'success' : 'error';
        connectionMessages[target] = message;
        if (!showToast) {
            return;
        }
        if (success) {
            toast.success(message);
            return;
        }
        toast.error(message);
    }

    async function testConnection(target: 'tmdb' | 'opensubtitles' | 'prowlarr', showToast = true): Promise<void> {
        if (!formElement) {
            return;
        }

        connectionStates[target] = 'loading';
        connectionMessages[target] = '';

        try {
            const response = await fetch('/api/settings/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildTestConnectionRequestBody(target)),
            });
            const result = (await response.json()) as { success: boolean; message: string };
            applyConnectionResult(target, result.success, result.message, showToast);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Connection failed';
            applyConnectionResult(target, false, message, showToast);
        }
    }

    $effect(() => {
        tmdbApiKey = data.settings.tmdb.apiKey;
        prowlarrUrl = data.settings.prowlarr.url;
        prowlarrApiKey = data.settings.prowlarr.apiKey;
        opensubtitlesApiKey = data.settings.opensubtitles.apiKey;
        opensubtitlesUsername = data.settings.opensubtitles.username;
        opensubtitlesPassword = data.settings.opensubtitles.password;
    });
</script>

<div class="mx-auto max-w-6xl px-4 py-8">
    <div class="mb-8">
        <h1 class="text-3xl font-semibold text-balance">Settings</h1>
        <p class="mt-1 text-sm text-muted-foreground text-pretty">Manage metadata, subtitles, and discovery.</p>
    </div>

    <div class="mb-6 overflow-x-auto lg:hidden">
        <nav class="flex gap-2 pb-1">
            {#each sectionLinks as section}
                <a
                    href={`#${section.id}`}
                    class="whitespace-nowrap rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                    {section.label}
                </a>
            {/each}
        </nav>
    </div>

    <form
        bind:this={formElement}
        method="POST"
        class="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]"
        use:enhance={() => {
            saving = true;
            return async ({ result, update }) => {
                saving = false;
                if (result.type === 'success') {
                    toast.success('Settings saved');
                } else {
                    const message =
                        result.type === 'failure' && typeof result.data?.error === 'string'
                            ? result.data.error
                            : 'Failed to save settings';
                    toast.error(message);
                }
                await update();
            };
        }}
    >
        <aside class="hidden lg:block">
            <div class="sticky top-24 space-y-4">
                <nav class="rounded-lg border border-border bg-card p-2">
                    {#each sectionLinks as section}
                        <a href={`#${section.id}`} class="block rounded-md px-3 py-2 transition-colors hover:bg-accent">
                            <div class="text-sm font-medium text-foreground">{section.label}</div>
                            <p class="mt-0.5 text-xs text-muted-foreground">{section.description}</p>
                        </a>
                    {/each}
                </nav>

                <div class="rounded-lg border border-border bg-card p-4">
                    <p class="text-sm font-medium text-foreground">Save changes</p>
                    <Button type="submit" disabled={saving} class="mt-3 w-full justify-center">
                        <Save class="mr-2 size-4" />
                        {saving ? 'Saving...' : 'Save settings'}
                    </Button>
                </div>
            </div>
        </aside>

        <div class="space-y-6">
            {#if form?.error}
                <div
                    class="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                    {form.error}
                </div>
            {/if}

            <section id="tmdb" class="scroll-mt-24 rounded-lg border border-border bg-card">
                <div class="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
                    <div class="flex items-start gap-3">
                        <Film class="mt-0.5 size-6 text-muted-foreground" />
                        <div>
                            <div class="flex items-center gap-2">
                                <h2 class="text-base font-semibold text-foreground">TMDB</h2>
                                {#if connectionStates.tmdb === 'loading'}
                                    <Loader2 class="size-4 animate-spin text-muted-foreground" />
                                {:else if connectionStates.tmdb === 'success'}
                                    <Check
                                        class={`size-4 ${getStatusIconClass(connectionStates.tmdb)}`}
                                        title={connectionMessages.tmdb}
                                    />
                                {:else if connectionStates.tmdb === 'error'}
                                    <X
                                        class={`size-4 ${getStatusIconClass(connectionStates.tmdb)}`}
                                        title={connectionMessages.tmdb}
                                    />
                                {/if}
                            </div>
                            <p class="mt-1 text-sm text-muted-foreground">Titles, posters, and metadata.</p>
                        </div>
                    </div>
                    <div class="group relative">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            class="h-8 w-8 text-muted-foreground"
                            aria-label="Test TMDB connection"
                            disabled={connectionStates.tmdb === 'loading'}
                            onclick={() => testConnection('tmdb')}
                        >
                            <Unplug class="size-4" />
                        </Button>
                        <div
                            class="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        >
                            Test connection
                        </div>
                    </div>
                </div>
                <div class="px-6 py-5">
                    <label for="tmdbApiKey" class="mb-2 block text-sm font-medium text-foreground">API Key</label>
                    <Input
                        id="tmdbApiKey"
                        name="tmdbApiKey"
                        type="password"
                        bind:value={tmdbApiKey}
                        placeholder="TMDB API Key"
                    />
                    <p class="mt-2 text-xs text-muted-foreground">
                        Create one at
                        <a
                            href="https://www.themoviedb.org/settings/api"
                            target="_blank"
                            rel="noopener"
                            class="text-primary hover:underline"
                        >
                            themoviedb.org
                        </a>
                    </p>
                </div>
            </section>

            <section id="opensubtitles" class="scroll-mt-24 rounded-lg border border-border bg-card">
                <div class="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
                    <div class="flex items-start gap-3">
                        <Captions class="mt-0.5 size-6 text-muted-foreground" />
                        <div>
                            <div class="flex items-center gap-2">
                                <h2 class="text-base font-semibold text-foreground">OpenSubtitles</h2>
                                {#if connectionStates.opensubtitles === 'loading'}
                                    <Loader2 class="size-4 animate-spin text-muted-foreground" />
                                {:else if connectionStates.opensubtitles === 'success'}
                                    <Check
                                        class={`size-4 ${getStatusIconClass(connectionStates.opensubtitles)}`}
                                        title={connectionMessages.opensubtitles}
                                    />
                                {:else if connectionStates.opensubtitles === 'error'}
                                    <X
                                        class={`size-4 ${getStatusIconClass(connectionStates.opensubtitles)}`}
                                        title={connectionMessages.opensubtitles}
                                    />
                                {/if}
                            </div>
                            <p class="mt-1 text-sm text-muted-foreground">Subtitle search and downloads.</p>
                        </div>
                    </div>
                    <div class="group relative">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            class="h-8 w-8 text-muted-foreground"
                            aria-label="Test OpenSubtitles connection"
                            disabled={connectionStates.opensubtitles === 'loading'}
                            onclick={() => testConnection('opensubtitles')}
                        >
                            <Unplug class="size-4" />
                        </Button>
                        <div
                            class="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        >
                            Test connection
                        </div>
                    </div>
                </div>
                <div class="grid gap-5 px-6 py-5 md:grid-cols-2">
                    <div class="md:col-span-2">
                        <label for="opensubtitlesApiKey" class="mb-2 block text-sm font-medium text-foreground">
                            API Key
                        </label>
                        <Input
                            id="opensubtitlesApiKey"
                            name="opensubtitlesApiKey"
                            type="password"
                            bind:value={opensubtitlesApiKey}
                            placeholder="OpenSubtitles API Key"
                        />
                        <p class="mt-2 text-xs text-muted-foreground">
                            Create one at
                            <a
                                href="https://www.opensubtitles.com/consumers"
                                target="_blank"
                                rel="noopener"
                                class="text-primary hover:underline"
                            >
                                opensubtitles.com
                            </a>
                        </p>
                    </div>
                    <div>
                        <label for="opensubtitlesUsername" class="mb-2 block text-sm font-medium text-foreground">
                            Username
                        </label>
                        <Input
                            id="opensubtitlesUsername"
                            name="opensubtitlesUsername"
                            type="text"
                            bind:value={opensubtitlesUsername}
                            placeholder="OpenSubtitles Username"
                        />
                    </div>
                    <div>
                        <label for="opensubtitlesPassword" class="mb-2 block text-sm font-medium text-foreground">
                            Password
                        </label>
                        <Input
                            id="opensubtitlesPassword"
                            name="opensubtitlesPassword"
                            type="password"
                            bind:value={opensubtitlesPassword}
                            placeholder="OpenSubtitles Password"
                        />
                    </div>
                </div>
            </section>

            <section id="prowlarr" class="scroll-mt-24 rounded-lg border border-border bg-card">
                <div class="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
                    <div class="flex items-start gap-3">
                        <Server class="mt-0.5 size-6 text-muted-foreground" />
                        <div>
                            <div class="flex items-center gap-2">
                                <h2 class="text-base font-semibold text-foreground">Prowlarr</h2>
                                {#if connectionStates.prowlarr === 'loading'}
                                    <Loader2 class="size-4 animate-spin text-muted-foreground" />
                                {:else if connectionStates.prowlarr === 'success'}
                                    <Check
                                        class={`size-4 ${getStatusIconClass(connectionStates.prowlarr)}`}
                                        title={connectionMessages.prowlarr}
                                    />
                                {:else if connectionStates.prowlarr === 'error'}
                                    <X
                                        class={`size-4 ${getStatusIconClass(connectionStates.prowlarr)}`}
                                        title={connectionMessages.prowlarr}
                                    />
                                {/if}
                            </div>
                            <p class="mt-1 text-sm text-muted-foreground">Indexers and torrent discovery.</p>
                        </div>
                    </div>
                    <div class="group relative">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            class="h-8 w-8 text-muted-foreground"
                            aria-label="Test Prowlarr connection"
                            disabled={connectionStates.prowlarr === 'loading'}
                            onclick={() => testConnection('prowlarr')}
                        >
                            <Unplug class="size-4" />
                        </Button>
                        <div
                            class="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        >
                            Test connection
                        </div>
                    </div>
                </div>
                <div class="space-y-5 px-6 py-5">
                    <div class="grid gap-5 md:grid-cols-2">
                        <div>
                            <label for="prowlarrUrl" class="mb-2 block text-sm font-medium text-foreground">URL</label>
                            <Input
                                id="prowlarrUrl"
                                name="prowlarrUrl"
                                type="url"
                                bind:value={prowlarrUrl}
                                placeholder="http://localhost:9696"
                            />
                        </div>
                        <div>
                            <label for="prowlarrApiKey" class="mb-2 block text-sm font-medium text-foreground">
                                API Key
                            </label>
                            <Input
                                id="prowlarrApiKey"
                                name="prowlarrApiKey"
                                type="password"
                                bind:value={prowlarrApiKey}
                                placeholder="Prowlarr API Key"
                            />
                            {#if !prowlarrApiKey && prowlarrUrl}
                                <p class="mt-2 text-xs text-muted-foreground">
                                    API key is available at
                                    <a
                                        href={prowlarrUrl}
                                        target="_blank"
                                        rel="noopener"
                                        class="text-primary hover:underline"
                                        >{prowlarrUrl}</a
                                    >
                                </p>
                            {/if}
                        </div>
                    </div>

                    <div>
                        <label for="prowlarrMinSeeders" class="mb-2 block text-sm font-medium text-foreground">
                            Minimum seeders
                        </label>
                        <Input
                            id="prowlarrMinSeeders"
                            name="prowlarrMinSeeders"
                            type="number"
                            value={data.settings.prowlarr.minSeeders}
                            min="0"
                            class="tabular-nums"
                        />
                    </div>

                    <details bind:open={indexerManagementOpen} class="rounded-md border border-border bg-background">
                        <summary
                            class="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-foreground"
                        >
                            <span>Indexer management</span>
                            <ChevronDown
                                class={indexerManagementOpen
                                    ? 'size-4 rotate-180 text-muted-foreground transition-transform duration-150'
                                    : 'size-4 text-muted-foreground transition-transform duration-150'}
                            />
                        </summary>
                        <div class="border-t border-border p-4">
                            <IndexerManager {prowlarrUrl} {prowlarrApiKey} />
                        </div>
                    </details>
                </div>
            </section>

            <div class="lg:hidden">
                <Button type="submit" disabled={saving} class="w-full justify-center">
                    <Save class="mr-2 size-4" />
                    {saving ? 'Saving...' : 'Save settings'}
                </Button>
            </div>
        </div>
    </form>
</div>
