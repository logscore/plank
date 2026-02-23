<script lang="ts">
    import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, Loader, Plus, RefreshCw, Trash2 } from '@lucide/svelte';
    import { onMount } from 'svelte';
    import { toast } from 'svelte-sonner';
    import Button from '$lib/components/ui/Button.svelte';
    import { confirmDelete } from '$lib/ui-state.svelte';

    // Props
    let { prowlarrUrl, prowlarrApiKey } = $props<{
        prowlarrUrl: string;
        prowlarrApiKey: string;
    }>();

    // Types
    interface Indexer {
        id: number;
        name: string;
        protocol: string;
    }

    interface IndexerSchema {
        name: string;
        implementation: string;
        protocol?: string;
    }

    // State
    let testingConnection = $state(false);
    let connectionStatus = $state<'connected' | 'failed' | 'unchecked'>('unchecked');

    let indexers = $state<Indexer[]>([]);
    let schemas = $state<IndexerSchema[]>([]);
    let loadingIndexers = $state(false);

    let advancedOpen = $state(false);
    let selectedImplementation = $state('');

    // Derived sorted schemas (don't mutate state in template)
    let sortedSchemas = $derived([...schemas].sort((a, b) => a.name.localeCompare(b.name)));

    // Constants
    const PACKAGES = [
        {
            id: 'general',
            name: 'General Entertainment',
            description: 'Movies & TV (YTS, 1337x, The Pirate Bay)',
            icon: '🎬',
            indexers: ['YTS', '1337x', 'The Pirate Bay'],
        },
        {
            id: 'anime',
            name: 'Anime Fan',
            description: 'Anime (Nyaa.si, AnimeTosho, AniDex)',
            icon: '🎌',
            indexers: ['Nyaa.si', 'AnimeTosho', 'AniDex'],
        },
        {
            id: 'tv',
            name: 'TV Show Specialists',
            description: 'TV Series (EZTV, TorrentGalaxy, TorLock)',
            icon: '📺',
            indexers: ['EZTV', 'TorrentGalaxy', 'TorLock'],
        },
    ];

    // Actions
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
                loadIndexers();
            } else {
                connectionStatus = 'failed';
            }
        } catch (e) {
            connectionStatus = 'failed';
        } finally {
            testingConnection = false;
        }
    }

    async function loadIndexers() {
        loadingIndexers = true;
        try {
            const [idxRes, schemaRes] = await Promise.all([
                fetch('/api/prowlarr/indexer'),
                fetch('/api/prowlarr/indexer/schema'),
            ]);

            if (idxRes.ok) {
                indexers = await idxRes.json();
            }
            if (schemaRes.ok) {
                schemas = await schemaRes.json();
            }
        } catch (e) {
            console.error('Failed to load indexers', e);
        } finally {
            loadingIndexers = false;
        }
    }

    async function addIndexer(schema: IndexerSchema) {
        const toastId = toast.loading(`Adding ${schema.name}...`);
        try {
            const res = await fetch('/api/prowlarr/indexer', {
                method: 'POST',
                body: JSON.stringify(schema),
                headers: { 'Content-Type': 'application/json' },
            });

            if (res.ok) {
                toast.success(`${schema.name} added`, { id: toastId });
                loadIndexers();
            } else {
                toast.error(`Failed to add ${schema.name}`, { id: toastId });
            }
        } catch (e) {
            toast.error('Network error', { id: toastId });
        }
    }

    async function deleteIndexer(id: number, name: string) {
        confirmDelete(`Remove ${name}?`, 'Are you sure you want to remove this indexer?', async () => {
            try {
                const res = await fetch(`/api/prowlarr/indexer?id=${id}`, {
                    method: 'DELETE',
                });
                if (res.ok) {
                    toast.success('Indexer removed');
                    loadIndexers();
                } else {
                    toast.error('Failed to remove indexer');
                }
            } catch (e) {
                toast.error('Network error');
            }
        });
    }

    async function applyPackage(pkg: (typeof PACKAGES)[0]) {
        const toastId = toast.loading(`Configuring ${pkg.name}...`);
        let addedCount = 0;
        let failCount = 0;

        for (const indexerName of pkg.indexers) {
            // Check if already exists
            if (indexers.some((i) => i.name === indexerName)) {
                continue;
            }

            // Find schema
            const schema = schemas.find((s) => s.name === indexerName);
            if (!schema) {
                console.warn(`Schema for ${indexerName} not found`);
                failCount++;
                continue;
            }

            // Add
            try {
                const res = await fetch('/api/prowlarr/indexer', {
                    method: 'POST',
                    body: JSON.stringify(schema),
                    headers: { 'Content-Type': 'application/json' },
                });
                if (res.ok) {
                    addedCount++;
                } else {
                    failCount++;
                }
            } catch {
                failCount++;
            }
        }

        loadIndexers();
        toast.success(`Package applied: ${addedCount} added`, { id: toastId });
    }

    onMount(() => {
        if (prowlarrUrl && prowlarrApiKey) {
            testConnection();
        } else if (prowlarrUrl && prowlarrApiKey === '') {
            // Case where API key is managed by server (empty string passed)
            testConnection();
        }
    });
</script>

<div class="space-y-6">
    <!-- Connection Status -->
    <div class="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
        <div class="flex items-center gap-3">
            <div class="relative">
                {#if testingConnection}
                    <Loader class="w-5 h-5 animate-spin text-muted-foreground" />
                {:else if connectionStatus === "connected"}
                    <CircleCheck class="w-5 h-5 text-green-500" />
                {:else if connectionStatus === "failed"}
                    <CircleAlert class="w-5 h-5 text-red-500" />
                {:else}
                    <div class="w-5 h-5 rounded-full border-2 border-muted-foreground"></div>
                {/if}
            </div>
            <div class="flex flex-col"><span class="font-medium text-sm">Connection Status</span></div>
        </div>
    </div>

    {#if connectionStatus === "connected"}
        <!-- Quick Setup -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            {#each PACKAGES as pkg}
                <div
                    class="border rounded-lg p-4 bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                    role="button"
                    tabindex="0"
                    onclick={() => applyPackage(pkg)}
                    onkeydown={(e) => e.key === "Enter" && applyPackage(pkg)}
                >
                    <div class="text-2xl mb-2">{pkg.icon}</div>
                    <h3 class="font-semibold mb-1">{pkg.name}</h3>
                    <p class="text-xs text-muted-foreground mb-3">{pkg.description}</p>
                    <Button variant="secondary" size="sm" class="w-full" type="button">
                        <Plus class="w-3 h-3 mr-2" /> Quick Add
                    </Button>
                </div>
            {/each}
        </div>

        <!-- Current Indexers -->
        <div class="rounded-lg border bg-card">
            <div class="p-4 border-b flex justify-between items-center">
                <h3 class="font-semibold">Configured Indexers ({indexers.length})</h3>
                <Button variant="ghost" size="sm" type="button" onclick={loadIndexers} disabled={loadingIndexers}>
                    <RefreshCw class="w-4 h-4 {loadingIndexers ? 'animate-spin' : ''}" />
                </Button>
            </div>
            <div class="divide-y max-h-60 overflow-y-auto">
                {#if indexers.length === 0}
                    <div class="p-8 text-center text-muted-foreground text-sm">
                        No indexers configured. Use a Quick Setup package above or add manually.
                    </div>
                {:else}
                    {#each indexers as indexer}
                        <div class="p-3 flex items-center justify-between hover:bg-muted/50">
                            <div class="flex items-center gap-3">
                                <span class="text-sm font-medium">{indexer.name}</span>
                                <span class="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
                                    {indexer.protocol}
                                </span>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                type="button"
                                class="h-8 w-8 text-destructive hover:text-destructive"
                                onclick={() =>
                                    deleteIndexer(indexer.id, indexer.name)}
                            >
                                <Trash2 class="w-4 h-4" />
                            </Button>
                        </div>
                    {/each}
                {/if}
            </div>
        </div>

        <!-- Advanced Manual Add -->
        <div class="border rounded-lg bg-card">
            <button
                type="button"
                class="w-full flex items-center justify-between p-4 font-medium text-sm hover:bg-muted/50 transition-colors cursor-pointer"
                onclick={() => {
                    advancedOpen = !advancedOpen;
                }}
            >
                <span>Advanced: Add Indexer Manually</span>
                {#if advancedOpen}
                    <ChevronUp class="w-4 h-4" />
                {:else}
                    <ChevronDown class="w-4 h-4" />
                {/if}
            </button>

            {#if advancedOpen}
                <div class="p-4 border-t bg-muted/20">
                    <div class="flex gap-2">
                        <select
                            bind:value={selectedImplementation}
                            class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            <option value="">Select an indexer to add...</option>
                            {#each sortedSchemas as schema}
                                <option value={schema.name}>
                                    {schema.name} (
                                    {schema.protocol ||
                                        "torrent"}
                                    )
                                </option>
                            {/each}
                        </select>
                        <Button
                            type="button"
                            disabled={!selectedImplementation}
                            onclick={() => {
                                const schema = schemas.find(
                                    (s) => s.name === selectedImplementation,
                                );
                                if (schema) addIndexer(schema);
                            }}
                        >
                            Add
                        </Button>
                    </div>
                </div>
            {/if}
        </div>
    {/if}
</div>
