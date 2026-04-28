<script lang="ts">
    import { toast } from 'svelte-sonner';
    import Button from '$lib/components/ui/Button.svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import { demoStore } from '$lib/demo/store.svelte';

    let form = $state({
        tmdbApiKey: demoStore.settings.tmdbApiKey,
        opensubtitlesApiKey: demoStore.settings.opensubtitlesApiKey,
        opensubtitlesUsername: demoStore.settings.opensubtitlesUsername,
        opensubtitlesPassword: demoStore.settings.opensubtitlesPassword,
        prowlarrUrl: demoStore.settings.prowlarrUrl,
        prowlarrApiKey: demoStore.settings.prowlarrApiKey,
        trustedGroups: demoStore.settings.trustedGroups.join(', '),
        minSeeders: String(demoStore.settings.minSeeders),
    });

    function save() {
        demoStore.updateSettings({
            tmdbApiKey: form.tmdbApiKey,
            opensubtitlesApiKey: form.opensubtitlesApiKey,
            opensubtitlesUsername: form.opensubtitlesUsername,
            opensubtitlesPassword: form.opensubtitlesPassword,
            prowlarrUrl: form.prowlarrUrl,
            prowlarrApiKey: form.prowlarrApiKey,
            trustedGroups: form.trustedGroups
                .split(',')
                .map((value: string) => value.trim())
                .filter(Boolean),
            minSeeders: Number.parseInt(form.minSeeders, 10) || 0,
        });
        toast.success('Settings saved locally');
    }

    function testConnection(service: string) {
        toast.success(`${service} connection looks good`);
    }
</script>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div class="mb-8">
        <h1 class="text-3xl font-semibold tracking-tight">Settings</h1>
        <p class="mt-2 text-sm text-muted-foreground">Configuration for metadata, subtitles, and search providers.</p>
    </div>

    <div class="grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav class="rounded-2xl border border-white/10 bg-card/50 p-4 h-fit">
            <div class="space-y-2 text-sm">
                <a href="#tmdb" class="block rounded-lg px-3 py-2 hover:bg-white/5">TMDB</a>
                <a href="#opensubtitles" class="block rounded-lg px-3 py-2 hover:bg-white/5">OpenSubtitles</a>
                <a href="#prowlarr" class="block rounded-lg px-3 py-2 hover:bg-white/5">Prowlarr</a>
            </div>
        </nav>

        <div class="space-y-6">
            <section id="tmdb" class="rounded-2xl border border-white/10 bg-card/60 p-6">
                <div class="mb-5 flex items-center justify-between gap-4">
                    <div>
                        <h2 class="text-xl font-semibold">TMDB</h2>
                        <p class="text-sm text-muted-foreground">
                            Artwork and discovery configuration for the catalog.
                        </p>
                    </div>
                    <Button variant="secondary" onclick={() => testConnection('TMDB')}>Test Connection</Button>
                </div>
                <div class="space-y-2">
                    <label for="tmdb-api-key" class="text-sm font-medium">API Key</label>
                    <Input id="tmdb-api-key" bind:value={form.tmdbApiKey} class="bg-background/50" />
                </div>
            </section>

            <section id="opensubtitles" class="rounded-2xl border border-white/10 bg-card/60 p-6">
                <div class="mb-5 flex items-center justify-between gap-4">
                    <div>
                        <h2 class="text-xl font-semibold">OpenSubtitles</h2>
                        <p class="text-sm text-muted-foreground">Masked values mirror a configured instance.</p>
                    </div>
                    <Button variant="secondary" onclick={() => testConnection('OpenSubtitles')}>Test Connection</Button>
                </div>
                <div class="grid gap-4 md:grid-cols-2">
                    <div class="space-y-2">
                        <label for="opensubtitles-api-key" class="text-sm font-medium">API Key</label>
                        <Input
                            id="opensubtitles-api-key"
                            bind:value={form.opensubtitlesApiKey}
                            class="bg-background/50"
                        />
                    </div>
                    <div class="space-y-2">
                        <label for="opensubtitles-username" class="text-sm font-medium">Username</label>
                        <Input
                            id="opensubtitles-username"
                            bind:value={form.opensubtitlesUsername}
                            class="bg-background/50"
                        />
                    </div>
                    <div class="space-y-2 md:col-span-2">
                        <label for="opensubtitles-password" class="text-sm font-medium">Password</label>
                        <Input
                            id="opensubtitles-password"
                            bind:value={form.opensubtitlesPassword}
                            class="bg-background/50"
                        />
                    </div>
                </div>
            </section>

            <section id="prowlarr" class="rounded-2xl border border-white/10 bg-card/60 p-6">
                <div class="mb-5 flex items-center justify-between gap-4">
                    <div>
                        <h2 class="text-xl font-semibold">Prowlarr</h2>
                        <p class="text-sm text-muted-foreground">Indexer settings and seeded indexer statuses.</p>
                    </div>
                    <Button variant="secondary" onclick={() => testConnection('Prowlarr')}>Test Connection</Button>
                </div>
                <div class="grid gap-4 md:grid-cols-2">
                    <div class="space-y-2 md:col-span-2">
                        <label for="prowlarr-url" class="text-sm font-medium">URL</label>
                        <Input id="prowlarr-url" bind:value={form.prowlarrUrl} class="bg-background/50" />
                    </div>
                    <div class="space-y-2">
                        <label for="prowlarr-api-key" class="text-sm font-medium">API Key</label>
                        <Input id="prowlarr-api-key" bind:value={form.prowlarrApiKey} class="bg-background/50" />
                    </div>
                    <div class="space-y-2">
                        <label for="prowlarr-min-seeders" class="text-sm font-medium">Min Seeders</label>
                        <Input id="prowlarr-min-seeders" bind:value={form.minSeeders} class="bg-background/50" />
                    </div>
                    <div class="space-y-2 md:col-span-2">
                        <label for="prowlarr-trusted-groups" class="text-sm font-medium">Trusted Groups</label>
                        <Input id="prowlarr-trusted-groups" bind:value={form.trustedGroups} class="bg-background/50" />
                    </div>
                </div>

                <div class="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
                    <h3 class="mb-3 font-medium">Seeded Indexers</h3>
                    <div class="space-y-2">
                        {#each demoStore.state.settings.indexers as indexer}
                            <div
                                class="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3 text-sm"
                            >
                                <div>
                                    <p>{indexer.name}</p>
                                    <p class="text-xs text-muted-foreground">{indexer.kind}</p>
                                </div>
                                <span
                                    class="rounded-full px-3 py-1 text-xs uppercase {indexer.status === 'connected' ? 'bg-green-500/15 text-green-300' : indexer.status === 'limited' ? 'bg-yellow-500/15 text-yellow-300' : 'bg-red-500/15 text-red-300'}"
                                    >{indexer.status}</span
                                >
                            </div>
                        {/each}
                    </div>
                </div>
            </section>

            <div class="flex justify-end">
                <Button onclick={save}>Save Settings</Button>
            </div>
        </div>
    </div>
</div>
