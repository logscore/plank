<script lang="ts">
    import { ChevronDown, Plus, RefreshCw, Trash2 } from "@lucide/svelte";
    import { Collapsible } from "bits-ui";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import Button from "$lib/components/ui/Button.svelte";
    import Scroller from "$lib/components/ui/Scroller.svelte";
    import SelectField from "$lib/components/ui/SelectField.svelte";
    import {
        createAddProwlarrIndexerMutation,
        createDeleteProwlarrIndexerMutation,
        createProwlarrIndexerSchemasQuery,
        createProwlarrIndexersQuery,
        createTestProwlarrConnectionMutation,
        type ProwlarrIndexerSchema,
    } from "$lib/data/prowlarr";
    import { confirmDelete } from "$lib/ui-state.svelte";

    const PACKAGES = [
        {
            id: "general",
            name: "General Entertainment",
            description: "Movies & TV (1337x, YTS, The Pirate Bay)",
            icon: "🎬",
            indexers: ["1337x", "YTS", "The Pirate Bay"],
        },
        {
            id: "anime",
            name: "Anime Fan",
            description: "Anime (Nyaa.si, AnimeTosho, AniDex)",
            icon: "🎌",
            indexers: ["Nyaa.si", "AnimeTosho", "AniDex"],
        },
        {
            id: "show",
            name: "TV Show Specialists",
            description: "TV Series (EZTV, TorrentGalaxy, TorLock)",
            icon: "📺",
            indexers: ["EZTV", "TorrentGalaxy", "TorLock"],
        },
    ];

    let connection = $state<{ status: "checking" } | { status: "connected" } | { status: "failed"; message: string }>({
        status: "checking",
    });
    let advancedOpen = $state(false);
    let selectedImplementation = $state("");

    const addIndexerMutation = createAddProwlarrIndexerMutation();
    const deleteIndexerMutation = createDeleteProwlarrIndexerMutation();
    const testConnectionMutation = createTestProwlarrConnectionMutation();
    const indexersQuery = createProwlarrIndexersQuery(() => connection.status === "connected");
    const schemasQuery = createProwlarrIndexerSchemasQuery(() => connection.status === "connected");

    const indexers = $derived(indexersQuery.data ?? []);
    const schemas = $derived(schemasQuery.data ?? []);
    const sortedSchemas = $derived([...schemas].sort((a, b) => a.name.localeCompare(b.name)));
    const schemaOptions = $derived(
        sortedSchemas.map((schema) => ({
            value: schema.name,
            label: `${schema.name} (${schema.protocol || "torrent"})`,
        }))
    );
    const loadingIndexers = $derived(
        connection.status === "connected" && (indexersQuery.isPending || schemasQuery.isPending)
    );

    async function testConnection() {
        connection = { status: "checking" };
        try {
            const result = await testConnectionMutation.mutateAsync({});
            if (result.success) {
                connection = { status: "connected" };
                return;
            }
            connection = {
                status: "failed",
                message: result.message || result.error || "Connection test failed.",
            };
        } catch (error) {
            connection = {
                status: "failed",
                message: error instanceof Error ? error.message : "Unable to reach Prowlarr.",
            };
        }
    }

    async function addIndexer(schema: ProwlarrIndexerSchema) {
        const toastId = toast.loading(`Adding ${schema.name}...`);
        try {
            await addIndexerMutation.mutateAsync(schema);
            toast.success(`${schema.name} added`, { id: toastId });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : `Failed to add ${schema.name}`, { id: toastId });
        }
    }

    function deleteIndexer(id: number, name: string) {
        confirmDelete(`Remove ${name}?`, "Are you sure you want to remove this indexer?", async () => {
            try {
                await deleteIndexerMutation.mutateAsync(id);
                toast.success("Indexer removed");
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to remove indexer");
            }
        });
    }

    async function applyPackage(pkg: (typeof PACKAGES)[number]) {
        const toastId = toast.loading(`Configuring ${pkg.name}...`);
        let addedCount = 0;
        let skippedCount = 0;

        for (const indexerName of pkg.indexers) {
            if (indexers.some((indexer) => indexer.name === indexerName)) {
                continue;
            }
            const schema = schemas.find((candidate) => candidate.name === indexerName);
            if (!schema) {
                skippedCount++;
                continue;
            }
            try {
                await addIndexerMutation.mutateAsync(schema);
                addedCount++;
            } catch {
                skippedCount++;
            }
        }

        const summary = skippedCount > 0 ? `${addedCount} added, ${skippedCount} skipped` : `${addedCount} added`;
        toast.success(`Package applied: ${summary}`, { id: toastId });
    }

    async function refreshIndexers() {
        await Promise.all([indexersQuery.refetch(), schemasQuery.refetch()]);
    }

    onMount(() => {
        testConnection();
    });
</script>

<div class="space-y-6">
    {#if connection.status === "connected"}
        <!-- Quick Setup -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            {#each PACKAGES as pkg}
                <button
                    type="button"
                    class="border rounded-lg p-4 bg-card text-left hover:bg-muted/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onclick={() => applyPackage(pkg)}
                >
                    <div class="text-2xl mb-2">{pkg.icon}</div>
                    <h3 class="font-semibold mb-1">{pkg.name}</h3>
                    <p class="min-h-10 text-xs text-muted-foreground mb-3">{pkg.description}</p>
                    <span
                        class="inline-flex h-9 w-full items-center justify-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground"
                    >
                        <Plus class="w-3 h-3 mr-2" />
                        Quick Add
                    </span>
                </button>
            {/each}
        </div>

        <!-- Current Indexers -->
        <div class="rounded-lg border bg-card">
            <div class="p-4 border-b flex justify-between items-center">
                <h3 class="font-semibold">Configured Indexers ({indexers.length})</h3>
                <Button variant="ghost" size="sm" type="button" onclick={refreshIndexers} disabled={loadingIndexers}>
                    <RefreshCw class="w-4 h-4 {loadingIndexers ? 'animate-spin' : ''}" />
                </Button>
            </div>
            <Scroller class="max-h-60">
                <div class="divide-y">
                    {#if indexers.length === 0}
                        <div class="p-8 text-center text-muted-foreground text-sm">
                            No indexers configured. Use a Quick Setup package above or add manually.
                        </div>
                    {:else}
                        {#each indexers as indexer}
                            <div class="py-3 px-5 flex items-center justify-between hover:bg-muted/50">
                                <div class="flex items-center gap-3">
                                    <span class="text-sm font-medium">{indexer.name}</span>
                                    <span
                                        class="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border"
                                    >
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
            </Scroller>
        </div>

        <!-- Advanced Manual Add -->
        <Collapsible.Root bind:open={advancedOpen} class="rounded-lg border bg-card">
            <Collapsible.Trigger
                class="group flex w-full items-center justify-between p-4 text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <span>Advanced: Add Indexer Manually</span>
                <ChevronDown class="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
            </Collapsible.Trigger>
            <Collapsible.Content>
                <div class="border-t bg-muted/20 p-4">
                    <div class="flex gap-2">
                        <SelectField
                            bind:value={selectedImplementation}
                            items={schemaOptions}
                            placeholder="Select an indexer to add..."
                            ariaLabel="Indexer implementation"
                            class="w-full"
                        />
                        <Button
                            type="button"
                            disabled={!selectedImplementation}
                            onclick={() => {
                                const schema = schemas.find(
                                    (entry) => entry.name === selectedImplementation,
                                );
                                if (schema) {
                                    addIndexer(schema);
                                }
                            }}
                        >
                            Add
                        </Button>
                    </div>
                </div>
            </Collapsible.Content>
        </Collapsible.Root>
    {:else if connection.status === "checking"}
        <div
            class="flex items-center justify-center gap-3 rounded-lg border bg-card p-8 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
        >
            <RefreshCw class="size-4 animate-spin" aria-hidden="true" />
            Checking Prowlarr configuration...
        </div>
    {:else}
        <div class="rounded-lg border border-destructive/50 bg-card p-6" role="alert">
            <h3 class="font-semibold text-balance">Prowlarr connection failed</h3>
            <p class="mt-2 text-sm text-muted-foreground text-pretty">
                There is an issue with your prowlarr configuration. Review your settings and try again.
            </p>
            <div class="mt-4 flex flex-wrap gap-3">
                <Button type="button" variant="outline" onclick={testConnection}>
                    <RefreshCw class="mr-2 size-4" aria-hidden="true" />
                    Retry
                </Button>
                <a
                    href="/settings/connections"
                    class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                    Review settings
                </a>
            </div>
        </div>
    {/if}
</div>
