<script lang="ts">
    import {
        AlertCircle,
        CheckCircle2,
        ChevronDown,
        ChevronUp,
        CircleAlert,
        CircleCheck,
        Loader,
        Plus,
        RefreshCw,
        Trash2,
    } from '@lucide/svelte';
    import { onMount } from 'svelte';
    import { toast } from 'svelte-sonner';
    import Button from '$lib/components/ui/Button.svelte';
    import { confirmDelete } from '$lib/ui-state.svelte';
    import { cn } from '$lib/utils';

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

    // Derived sorted schemas
    let sortedSchemas = $derived([...schemas].sort((a, b) => a.name.localeCompare(b.name)));

    // Constants
    const PACKAGES = [
        {
            id: 'general',
            name: 'General',
            description: 'YTS, 1337x, TFB',
            icon: '🎬',
            indexers: ['YTS', '1337x', 'The Pirate Bay'],
        },
        {
            id: 'anime',
            name: 'Anime',
            description: 'Nyaa, AnimeTosho',
            icon: '🎌',
            indexers: ['Nyaa.si', 'AnimeTosho', 'AniDex'],
        },
        {
            id: 'tv',
            name: 'TV Shows',
            description: 'EZTV, Galaxy',
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
                selectedImplementation = ''; // Reset selection
                advancedOpen = false; // Close dropdown
            } else {
                toast.error(`Failed to add ${schema.name}`, { id: toastId });
            }
        } catch (e) {
            toast.error('Network error', { id: toastId });
        }
    }

    async function deleteIndexer(id: number) {
        // Simplified confirmation for onboarding - just do it or use toast undo?
        // Let's stick to simple immediate delete for speed in onboarding, or reuse confirmDelete if available globally
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
    }

    async function applyPackage(pkg: (typeof PACKAGES)[0]) {
        const toastId = toast.loading(`Configuring ${pkg.name}...`);
        let addedCount = 0;
        let failCount = 0;

        for (const indexerName of pkg.indexers) {
            if (indexers.some((i) => i.name === indexerName)) {
                continue;
            }

            const schema = schemas.find((s) => s.name === indexerName);
            if (!schema) {
                failCount++;
                continue;
            }

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
        toast.success(`Added ${addedCount} indexers`, { id: toastId });
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
        {#if indexers.length > 0}
            <div class="flex flex-wrap gap-2 p-2 rounded-lg bg-black/20 border border-white/5 min-h-[50px]">
                {#each indexers as indexer}
                    <div
                        class="flex items-center gap-1 pl-2 pr-1 py-1 rounded-full bg-primary/20 text-xs border border-primary/20"
                    >
                        <span class="font-medium text-primary-foreground/80">{indexer.name}</span>
                        <button
                            type="button"
                            onclick={() => deleteIndexer(indexer.id)}
                            class="hover:bg-red-500/20 hover:text-red-400 rounded-full p-0.5 transition-colors"
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
