<script lang="ts">
    import { Captions, Check, ChevronDown, Film, HardDrive, Loader2, Save, Server, X } from '@lucide/svelte';
    import { onMount } from 'svelte';
    import { toast } from 'svelte-sonner';
    import { browser } from '$app/environment';
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
    let storageEnabled = $state(false);
    let storageProvider = $state<'local' | 's3'>('local');
    let storageLocalBasePath = $state('');
    let storageS3Bucket = $state('');
    let storageS3Region = $state('');
    let storageS3AccessKeyId = $state('');
    let storageS3SecretAccessKey = $state('');
    let storageS3Endpoint = $state('');
    let storageS3ForcePathStyle = $state(false);
    let connectionStatusHydrated = $state(false);
    let connectionStates = $state({
        tmdb: 'idle',
        opensubtitles: 'idle',
        prowlarr: 'idle',
        storage: 'idle',
    });
    let connectionMessages = $state({
        tmdb: '',
        opensubtitles: '',
        prowlarr: '',
        storage: '',
    });

    const sectionLinks: SectionLink[] = [
        { id: 'tmdb', label: 'TMDB', description: 'Metadata and artwork' },
        { id: 'opensubtitles', label: 'OpenSubtitles', description: 'Subtitle search' },
        { id: 'prowlarr', label: 'Prowlarr', description: 'Indexers and discovery' },
        { id: 'storage', label: 'Storage', description: 'Finished media storage' },
    ];
    const CONNECTION_STATUS_STORAGE_PREFIX = 'plank:settings:connection-status';

    const tmdbConnectionDirty = $derived(tmdbApiKey !== data.settings.tmdb.apiKey);
    const opensubtitlesConnectionDirty = $derived(
        opensubtitlesApiKey !== data.settings.opensubtitles.apiKey ||
            opensubtitlesUsername !== data.settings.opensubtitles.username ||
            opensubtitlesPassword !== data.settings.opensubtitles.password
    );
    const prowlarrConnectionDirty = $derived(
        prowlarrUrl !== data.settings.prowlarr.url || prowlarrApiKey !== data.settings.prowlarr.apiKey
    );
    const storageConnectionDirty = $derived(
        storageEnabled !== data.storageSettings.enabled ||
            storageProvider !== data.storageSettings.provider ||
            storageLocalBasePath !== data.storageSettings.local.basePath ||
            storageS3Bucket !== data.storageSettings.s3.bucket ||
            storageS3Region !== data.storageSettings.s3.region ||
            storageS3AccessKeyId !== data.storageSettings.s3.accessKeyId ||
            storageS3SecretAccessKey !== data.storageSettings.s3.secretAccessKey ||
            storageS3Endpoint !== data.storageSettings.s3.endpoint ||
            storageS3ForcePathStyle !== data.storageSettings.s3.forcePathStyle
    );

    function getConnectionStorageKey(): string {
        return `${CONNECTION_STATUS_STORAGE_PREFIX}:${data.activeOrganizationId ?? 'global'}`;
    }

    function getStatusCircleClass(status: string): string {
        if (status === 'success') {
            return 'flex size-8 items-center justify-center rounded-full border border-green-600/20 bg-green-600/10 text-green-600 dark:text-green-500';
        }
        if (status === 'error') {
            return 'flex size-8 items-center justify-center rounded-full border border-destructive/20 bg-destructive/10 text-destructive';
        }
        return 'flex size-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground';
    }

    function loadPersistedConnectionStatus(): void {
        if (!browser) {
            return;
        }
        const storedValue = localStorage.getItem(getConnectionStorageKey());
        if (!storedValue) {
            return;
        }
        try {
            const parsed = JSON.parse(storedValue) as {
                states?: typeof connectionStates;
                messages?: typeof connectionMessages;
            };
            if (parsed.states) {
                connectionStates = { ...connectionStates, ...parsed.states };
            }
            if (parsed.messages) {
                connectionMessages = { ...connectionMessages, ...parsed.messages };
            }
        } catch {
            localStorage.removeItem(getConnectionStorageKey());
        }
    }

    function persistConnectionStatus(): void {
        if (!browser) {
            return;
        }
        localStorage.setItem(
            getConnectionStorageKey(),
            JSON.stringify({ states: connectionStates, messages: connectionMessages })
        );
    }

    function buildTestConnectionRequestBody(
        target: 'tmdb' | 'opensubtitles' | 'prowlarr' | 'storage'
    ): Record<string, boolean | string> {
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
            storageEnabled,
            storageProvider,
            storageLocalBasePath: formData.get('storageLocalBasePath')?.toString() || '',
            storageS3Bucket: formData.get('storageS3Bucket')?.toString() || '',
            storageS3Region: formData.get('storageS3Region')?.toString() || '',
            storageS3AccessKeyId: formData.get('storageS3AccessKeyId')?.toString() || '',
            storageS3SecretAccessKey: formData.get('storageS3SecretAccessKey')?.toString() || '',
            storageS3Endpoint: formData.get('storageS3Endpoint')?.toString() || '',
            storageS3ForcePathStyle: formData.get('storageS3ForcePathStyle') === 'on',
        };
    }

    function applyConnectionResult(
        target: 'tmdb' | 'opensubtitles' | 'prowlarr' | 'storage',
        success: boolean,
        message: string,
        showToast: boolean
    ): void {
        connectionStates[target] = success ? 'success' : 'error';
        connectionMessages[target] = message;
        persistConnectionStatus();
        if (!showToast) {
            return;
        }
        if (success) {
            toast.success(message);
            return;
        }
        toast.error(message);
    }

    async function testConnection(
        target: 'tmdb' | 'opensubtitles' | 'prowlarr' | 'storage',
        showToast = true
    ): Promise<void> {
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

    async function runInitialConnectionTests(): Promise<void> {
        await Promise.allSettled([
            testConnection('tmdb', false),
            testConnection('opensubtitles', false),
            testConnection('prowlarr', false),
            ...(data.activeOrganizationId && data.canManageStorage ? [testConnection('storage', false)] : []),
        ]);
    }

    onMount(() => {
        loadPersistedConnectionStatus();
        connectionStatusHydrated = true;
        runInitialConnectionTests();
    });

    $effect(() => {
        if (!connectionStatusHydrated) {
            return;
        }
        persistConnectionStatus();
    });

    $effect(() => {
        tmdbApiKey = data.settings.tmdb.apiKey;
        prowlarrUrl = data.settings.prowlarr.url;
        prowlarrApiKey = data.settings.prowlarr.apiKey;
        opensubtitlesApiKey = data.settings.opensubtitles.apiKey;
        opensubtitlesUsername = data.settings.opensubtitles.username;
        opensubtitlesPassword = data.settings.opensubtitles.password;
        storageEnabled = data.storageSettings.enabled;
        storageProvider = data.storageSettings.provider;
        storageLocalBasePath = data.storageSettings.local.basePath;
        storageS3Bucket = data.storageSettings.s3.bucket;
        storageS3Region = data.storageSettings.s3.region;
        storageS3AccessKeyId = data.storageSettings.s3.accessKeyId;
        storageS3SecretAccessKey = data.storageSettings.s3.secretAccessKey;
        storageS3Endpoint = data.storageSettings.s3.endpoint;
        storageS3ForcePathStyle = data.storageSettings.s3.forcePathStyle;
    });
</script>

<div class="mx-auto max-w-6xl px-4 py-8">
    <div class="mb-8">
        <h1 class="text-3xl font-semibold text-balance">Settings</h1>
        <p class="mt-1 text-sm text-muted-foreground text-pretty">
            Manage metadata, subtitles, discovery, and storage.
        </p>
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
                            <h2 class="text-base font-semibold text-foreground">TMDB</h2>
                            <p class="mt-1 text-sm text-muted-foreground">Titles, posters, and metadata.</p>
                        </div>
                    </div>
                    <span
                        class={getStatusCircleClass(connectionStates.tmdb)}
                        title={connectionMessages.tmdb || 'Not tested'}
                    >
                        {#if connectionStates.tmdb === 'loading'}
                            <Loader2 class="size-4 animate-spin text-muted-foreground" />
                        {:else if connectionStates.tmdb === 'success'}
                            <Check class="size-4" />
                        {:else if connectionStates.tmdb === 'error'}
                            <X class="size-4" />
                        {/if}
                    </span>
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
                    {#if tmdbConnectionDirty}
                        <div class="mt-4 flex justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={connectionStates.tmdb === 'loading'}
                                onclick={() => testConnection('tmdb')}
                            >
                                Test connection
                            </Button>
                        </div>
                    {/if}
                </div>
            </section>

            <section id="opensubtitles" class="scroll-mt-24 rounded-lg border border-border bg-card">
                <div class="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
                    <div class="flex items-start gap-3">
                        <Captions class="mt-0.5 size-6 text-muted-foreground" />
                        <div>
                            <h2 class="text-base font-semibold text-foreground">OpenSubtitles</h2>
                            <p class="mt-1 text-sm text-muted-foreground">Subtitle search and downloads.</p>
                        </div>
                    </div>
                    <span
                        class={getStatusCircleClass(connectionStates.opensubtitles)}
                        title={connectionMessages.opensubtitles || 'Not tested'}
                    >
                        {#if connectionStates.opensubtitles === 'loading'}
                            <Loader2 class="size-4 animate-spin text-muted-foreground" />
                        {:else if connectionStates.opensubtitles === 'success'}
                            <Check class="size-4" />
                        {:else if connectionStates.opensubtitles === 'error'}
                            <X class="size-4" />
                        {/if}
                    </span>
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
                    {#if opensubtitlesConnectionDirty}
                        <div class="md:col-span-2 flex justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={connectionStates.opensubtitles === 'loading'}
                                onclick={() => testConnection('opensubtitles')}
                            >
                                Test connection
                            </Button>
                        </div>
                    {/if}
                </div>
            </section>

            <section id="prowlarr" class="scroll-mt-24 rounded-lg border border-border bg-card">
                <div class="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
                    <div class="flex items-start gap-3">
                        <Server class="mt-0.5 size-6 text-muted-foreground" />
                        <div>
                            <h2 class="text-base font-semibold text-foreground">Prowlarr</h2>
                            <p class="mt-1 text-sm text-muted-foreground">Indexers and torrent discovery.</p>
                        </div>
                    </div>
                    <span
                        class={getStatusCircleClass(connectionStates.prowlarr)}
                        title={connectionMessages.prowlarr || 'Not tested'}
                    >
                        {#if connectionStates.prowlarr === 'loading'}
                            <Loader2 class="size-4 animate-spin text-muted-foreground" />
                        {:else if connectionStates.prowlarr === 'success'}
                            <Check class="size-4" />
                        {:else if connectionStates.prowlarr === 'error'}
                            <X class="size-4" />
                        {/if}
                    </span>
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
                    {#if prowlarrConnectionDirty}
                        <div class="flex justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={connectionStates.prowlarr === 'loading'}
                                onclick={() => testConnection('prowlarr')}
                            >
                                Test connection
                            </Button>
                        </div>
                    {/if}
                </div>
            </section>

            <section id="storage" class="scroll-mt-24 rounded-lg border border-border bg-card">
                <div class="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
                    <div class="flex items-start gap-3">
                        <HardDrive class="mt-0.5 size-6 text-muted-foreground" />
                        <div>
                            <h2 class="text-base font-semibold text-foreground">Storage</h2>
                            <p class="mt-1 text-sm text-muted-foreground">Where finished media is stored.</p>
                        </div>
                    </div>

                    {#if data.activeOrganizationId && data.canManageStorage}
                        <div class="flex items-center gap-4">
                            <span
                                class={getStatusCircleClass(connectionStates.storage)}
                                title={connectionMessages.storage || 'Not tested'}
                            >
                                {#if connectionStates.storage === 'loading'}
                                    <Loader2 class="size-4 animate-spin text-muted-foreground" />
                                {:else if connectionStates.storage === 'success'}
                                    <Check class="size-4" />
                                {:else if connectionStates.storage === 'error'}
                                    <X class="size-4" />
                                {/if}
                            </span>
                            <label class="inline-flex items-center gap-3 text-sm font-medium text-foreground">
                                <span>Enabled</span>
                                <span class="relative inline-flex h-6 w-11 items-center">
                                    <input
                                        type="checkbox"
                                        name="storageEnabled"
                                        bind:checked={storageEnabled}
                                        class="peer sr-only"
                                    >
                                    <span
                                        class="absolute inset-0 rounded-full bg-muted transition-colors peer-checked:bg-primary"
                                    ></span>
                                    <span
                                        class="absolute left-0.5 size-5 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-5"
                                    ></span>
                                </span>
                            </label>
                        </div>
                    {:else}
                        <span class="text-sm text-muted-foreground"
                            >{!data.activeOrganizationId ? 'Select an organization' : 'Organization admins only'}</span
                        >
                    {/if}
                </div>

                <div class="space-y-5 px-6 py-5">
                    {#if !data.activeOrganizationId}
                        <p class="text-sm text-muted-foreground">Select an organization to edit storage settings.</p>
                    {:else if !data.canManageStorage}
                        <p class="text-sm text-muted-foreground">
                            Only organization owners and admins can edit storage settings.
                        </p>
                    {:else if !storageEnabled}
                        <p class="text-sm text-muted-foreground">
                            Finished files will use the default local storage path.
                        </p>
                    {:else}
                        <div>
                            <label for="storageProvider" class="mb-2 block text-sm font-medium text-foreground">
                                Provider
                            </label>
                            <select
                                id="storageProvider"
                                name="storageProvider"
                                bind:value={storageProvider}
                                class="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                                <option value="local">Local / NAS</option>
                                <option value="s3">S3-compatible</option>
                            </select>
                        </div>

                        {#if storageProvider === 'local'}
                            <div>
                                <label
                                    for="storageLocalBasePath"
                                    class="mb-2 block text-sm font-medium text-foreground"
                                >
                                    Base path
                                </label>
                                <Input
                                    id="storageLocalBasePath"
                                    name="storageLocalBasePath"
                                    type="text"
                                    bind:value={storageLocalBasePath}
                                    placeholder="/mnt/media"
                                />
                                {#if form?.fieldErrors?.storageLocalBasePath}
                                    <p class="mt-2 text-xs text-destructive">{form.fieldErrors.storageLocalBasePath}</p>
                                {/if}
                            </div>
                        {:else}
                            <div class="grid gap-5 md:grid-cols-2">
                                <div>
                                    <label for="storageS3Bucket" class="mb-2 block text-sm font-medium text-foreground">
                                        Bucket
                                    </label>
                                    <Input
                                        id="storageS3Bucket"
                                        name="storageS3Bucket"
                                        type="text"
                                        bind:value={storageS3Bucket}
                                        placeholder="media-bucket"
                                    />
                                    {#if form?.fieldErrors?.storageS3Bucket}
                                        <p class="mt-2 text-xs text-destructive">{form.fieldErrors.storageS3Bucket}</p>
                                    {/if}
                                </div>
                                <div>
                                    <label for="storageS3Region" class="mb-2 block text-sm font-medium text-foreground">
                                        Region
                                    </label>
                                    <Input
                                        id="storageS3Region"
                                        name="storageS3Region"
                                        type="text"
                                        bind:value={storageS3Region}
                                        placeholder="us-east-1 (auto for R2)"
                                    />
                                    {#if form?.fieldErrors?.storageS3Region}
                                        <p class="mt-2 text-xs text-destructive">{form.fieldErrors.storageS3Region}</p>
                                    {/if}
                                </div>
                                <div>
                                    <label
                                        for="storageS3AccessKeyId"
                                        class="mb-2 block text-sm font-medium text-foreground"
                                    >
                                        Access key
                                    </label>
                                    <Input
                                        id="storageS3AccessKeyId"
                                        name="storageS3AccessKeyId"
                                        type="text"
                                        bind:value={storageS3AccessKeyId}
                                        placeholder="AKIA..."
                                    />
                                    {#if form?.fieldErrors?.storageS3AccessKeyId}
                                        <p class="mt-2 text-xs text-destructive">
                                            {form.fieldErrors.storageS3AccessKeyId}
                                        </p>
                                    {/if}
                                </div>
                                <div>
                                    <label
                                        for="storageS3SecretAccessKey"
                                        class="mb-2 block text-sm font-medium text-foreground"
                                    >
                                        Secret key
                                    </label>
                                    <Input
                                        id="storageS3SecretAccessKey"
                                        name="storageS3SecretAccessKey"
                                        type="password"
                                        bind:value={storageS3SecretAccessKey}
                                        placeholder="Secret access key"
                                    />
                                    {#if form?.fieldErrors?.storageS3SecretAccessKey}
                                        <p class="mt-2 text-xs text-destructive">
                                            {form.fieldErrors.storageS3SecretAccessKey}
                                        </p>
                                    {/if}
                                </div>
                                <div class="md:col-span-2">
                                    <label
                                        for="storageS3Endpoint"
                                        class="mb-2 block text-sm font-medium text-foreground"
                                    >
                                        Endpoint
                                    </label>
                                    <Input
                                        id="storageS3Endpoint"
                                        name="storageS3Endpoint"
                                        type="url"
                                        bind:value={storageS3Endpoint}
                                        placeholder="https://s3.amazonaws.com"
                                    />
                                </div>
                                <label
                                    class="md:col-span-2 flex items-start gap-3 rounded-md border border-border px-4 py-3"
                                >
                                    <input
                                        type="checkbox"
                                        name="storageS3ForcePathStyle"
                                        bind:checked={storageS3ForcePathStyle}
                                        class="mt-0.5 size-4 rounded border-border"
                                    >
                                    <span>
                                        <span class="block text-sm font-medium text-foreground"
                                            >Use path-style URLs</span
                                        >
                                        <span class="mt-1 block text-sm text-muted-foreground"
                                            >Use this for providers that require bucket paths in the URL.</span
                                        >
                                    </span>
                                </label>
                            </div>
                        {/if}
                    {/if}
                    {#if data.activeOrganizationId && data.canManageStorage && storageConnectionDirty}
                        <div class="flex justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={connectionStates.storage === 'loading'}
                                onclick={() => testConnection('storage')}
                            >
                                Test connection
                            </Button>
                        </div>
                    {/if}
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
