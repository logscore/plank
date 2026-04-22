<script lang="ts">
    import { ChevronDown, Loader, Plus, Trash2 } from '@lucide/svelte';
    import { onMount } from 'svelte';
    import { toast } from 'svelte-sonner';
    import {
        createAddProwlarrIndexerMutation,
        createDeleteProwlarrIndexerMutation,
    } from '$lib/mutations/prowlarr-mutations';
    import {
        createProwlarrIndexerSchemasQuery,
        createProwlarrIndexersQuery,
        type ProwlarrIndexer,
        type ProwlarrIndexerSchema,
    } from '$lib/queries/prowlarr-queries';
    import { cn } from '$lib/utils';

    // Props
    let { prowlarrUrl, prowlarrApiKey } = $props<{
        prowlarrUrl: string;
        prowlarrApiKey: string;
    }>();

    // State
    let testingConnection = $state(false);
    let connectionStatus = $state<'connected' | 'failed' | 'unchecked'>('unchecked');

    let advancedOpen = $state(false);
    let pendingIndexerNames = $state<string[]>([]);

    const addIndexerMutation = createAddProwlarrIndexerMutation();
    const deleteIndexerMutation = createDeleteProwlarrIndexerMutation();

    let indexersQuery = $derived(createProwlarrIndexersQuery(() => connectionStatus === 'connected'));
    let schemasQuery = $derived(createProwlarrIndexerSchemasQuery(() => connectionStatus === 'connected'));
    let indexers = $derived(indexersQuery.data ?? []);
    let schemas = $derived(schemasQuery.data ?? []);
    let loadingIndexers = $derived(
        connectionStatus === 'connected' &&
            indexers.length === 0 &&
            pendingIndexerNames.length === 0 &&
            (indexersQuery.isPending || schemasQuery.isPending)
    );
    let visibleIndexers = $derived.by(() => {
        const pendingIndexers: ProwlarrIndexer[] = pendingIndexerNames
            .filter((name) => !indexers.some((indexer) => indexer.name === name))
            .map((name) => ({
                id: 0,
                name,
                protocol: 'torrent',
                optimistic: true,
            }));

        return [...indexers, ...pendingIndexers];
    });

    // Derived sorted schemas
    let sortedSchemas = $derived([...schemas].sort((a, b) => a.name.localeCompare(b.name)));

    // Constants
    const PACKAGES = [
        {
            id: 'general',
            name: 'General',
            description: '1337x, YTS, TFB',
            icon: '🎬',
            indexers: ['1337x', 'YTS', 'The Pirate Bay'],
        },
        {
            id: 'anime',
            name: 'Anime',
            description: 'Nyaa, AnimeTosho',
            icon: '🎌',
            indexers: ['Nyaa.si', 'AnimeTosho', 'AniDex'],
        },
        {
            id: 'show',
            name: 'TV Shows',
            description: 'EZTV, Galaxy',
            icon: '📺',
            indexers: ['EZTV', 'TorrentGalaxy', 'TorLock'],
        },
    ];

    // Actions
    async function runWithPendingIndexer<T>(schema: ProwlarrIndexerSchema, action: () => Promise<T>): Promise<T> {
        pendingIndexerNames = pendingIndexerNames.includes(schema.name)
            ? pendingIndexerNames
            : [...pendingIndexerNames, schema.name];

        try {
            return await action();
        } finally {
            pendingIndexerNames = pendingIndexerNames.filter((name) => name !== schema.name);
        }
    }

    async function testConnection() {
        testingConnection = true;
        connectionStatus = 'unchecked';

        try {
            const res = await fetch('/api/prowlarr/test', {
                method: 'POST',
                body: JSON.stringify({
                    url: prowlarrUrl,
                    apiKey: prowlarrApiKey,
                }),
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();

            if (data.success) {
                connectionStatus = 'connected';
            } else {
                connectionStatus = 'failed';
            }
        } catch (e) {
            connectionStatus = 'failed';
        } finally {
            testingConnection = false;
        }
    }

    async function addIndexer(schema: ProwlarrIndexerSchema) {
        const toastId = toast.loading(`Adding ${schema.name}...`);
        try {
            await runWithPendingIndexer(schema, () => addIndexerMutation.mutateAsync(schema));
            toast.success(`${schema.name} added`, { id: toastId });
            advancedOpen = false;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : `Failed to add ${schema.name}`, { id: toastId });
        }
    }

    async function deleteIndexer(id: number) {
        try {
            await deleteIndexerMutation.mutateAsync(id);
            toast.success('Indexer removed');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to remove indexer');
        }
    }

    async function applyPackage(pkg: (typeof PACKAGES)[0]) {
        if (loadingIndexers || schemas.length === 0) {
            toast.error('Indexer list is still loading');
            return;
        }

        const toastId = toast.loading(`Configuring ${pkg.name}...`);
        const schemasToAdd = pkg.indexers
            .filter((indexerName) => !indexers.some((indexer) => indexer.name === indexerName))
            .map((indexerName) => schemas.find((schema) => schema.name === indexerName))
            .filter((schema): schema is ProwlarrIndexerSchema => Boolean(schema));

        if (schemasToAdd.length === 0) {
            toast.success('All package indexers are already configured', { id: toastId });
            return;
        }

        const results = await Promise.allSettled(
            schemasToAdd.map((schema) => runWithPendingIndexer(schema, () => addIndexerMutation.mutateAsync(schema)))
        );
        const addedCount = results.filter((result) => result.status === 'fulfilled').length;
        const failCount = results.length - addedCount;

        if (failCount === 0) {
            toast.success(`Added ${addedCount} indexers`, { id: toastId });
            return;
        }

        toast.error(`Added ${addedCount} indexers, ${failCount} failed`, { id: toastId });
    }

    onMount(() => {
        if (prowlarrUrl) {
            testConnection();
        }
    });
</script>

<div class="space-y-4">
    <!-- Status (Subtle) -->
    {#if connectionStatus === "failed"}
        <div class="text-xs text-destructive text-center bg-destructive/10 p-2 rounded">
            Cannot connect to Prowlarr. Check configuration.
        </div>
    {:else if connectionStatus === "unchecked" || testingConnection}
        <div class="flex items-center justify-center py-4">
            <Loader class="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
    {:else if connectionStatus === "connected"}
        <!-- Configured Indexers Chips -->
        {#if loadingIndexers}
            <div class="flex items-center justify-center py-4">
                <Loader class="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
        {:else if visibleIndexers.length > 0}
            <div class="flex flex-wrap gap-2 p-2 rounded-lg bg-black/20 border border-white/5 min-h-[50px]">
                {#each visibleIndexers as indexer (indexer.name)}
                    <div
                        class="flex items-center gap-1 pl-2 pr-1 py-1 rounded-full border text-xs {indexer.optimistic
                            ? 'bg-primary/10 border-primary/10 text-muted-foreground'
                            : 'bg-primary/20 border-primary/20'}"
                    >
                        {#if indexer.optimistic}
                            <Loader class="w-3 h-3 animate-spin" />
                        {/if}
                        <span class="font-medium text-primary-foreground/80">{indexer.name}</span>
                        <button
                            type="button"
                            onclick={() => deleteIndexer(indexer.id)}
                            class="hover:bg-red-500/20 hover:text-red-400 rounded-full p-0.5 transition-colors"
                            disabled={indexer.optimistic}
                        >
                            <Trash2 class="w-3 h-3" />
                        </button>
                    </div>
                {/each}
            </div>
        {/if}

        <!-- Quick Packages -->
        <div class="grid grid-cols-3 gap-2">
            {#each PACKAGES as pkg}
                <button
                    class="flex flex-col items-center justify-center p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-center gap-2 group"
                    onclick={() => applyPackage(pkg)}
                    type="button"
                    disabled={loadingIndexers}
                >
                    <span class="text-xl group-hover:scale-110 transition-transform">{pkg.icon}</span>
                    <div class="space-y-0.5">
                        <div class="text-xs font-semibold">{pkg.name}</div>
                        <div class="text-[10px] text-muted-foreground leading-tight hidden sm:block">
                            {pkg.description}
                        </div>
                    </div>
                </button>
            {/each}
        </div>

        <!-- Ghost Dropdown for Manual -->
        <div class="relative">
            <button
                type="button"
                class="w-full flex items-center justify-between p-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onclick={() => (advancedOpen = !advancedOpen)}
                disabled={loadingIndexers}
            >
                <span class="flex items-center gap-2">
                    <Plus class="w-3 h-3" />
                    Add specific indexer manually
                </span>
                <ChevronDown
                    class={cn(
                        "w-3 h-3 transition-transform",
                        advancedOpen && "rotate-180",
                    )}
                />
            </button>

            {#if advancedOpen}
                <div
                    class="absolute top-full left-0 right-0 mt-1 p-2 bg-black/90 backdrop-blur-xl border border-white/10 rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto"
                >
                    {#each sortedSchemas as schema}
                        <button
                            type="button"
                            class="w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 rounded flex items-center justify-between group"
                            onclick={() => addIndexer(schema)}
                        >
                            <span>{schema.name}</span>
                            <span class="text-xs text-muted-foreground opacity-0 group-hover:opacity-100"
                                >{schema.protocol}</span
                            >
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</div>
