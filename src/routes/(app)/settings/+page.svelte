<script lang="ts">
    import { Captions, Film, Save, Server, Settings } from '@lucide/svelte';
    import { toast } from 'svelte-sonner';
    import { enhance } from '$app/forms';
    import IndexerManager from '$lib/components/IndexerManager.svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import type { PageData } from './$types';

    let { data } = $props<{ data: PageData }>();

    let saving = $state(false);
    let prowlarrUrl = $derived(data.settings.prowlarr.url);
    let prowlarrApiKey = $derived(data.settings.prowlarr.apiKey);

    function getTrustedGroupsString(groups: string[]) {
        return groups.join(', ');
    }
</script>

<div class="container mx-auto px-4 py-8 max-w-4xl">
    <div class="flex items-center gap-4 mb-8">
        <Settings class="w-8 h-8 text-primary" />
        <h1 class="text-3xl font-bold">Settings</h1>
    </div>

    <form
        method="POST"
        use:enhance={() => {
            saving = true;
            return async ({ result, update }) => {
                saving = false;
                if (result.type === "success") {
                    toast.success("Settings saved successfully");
                } else {
                    toast.error("Failed to save settings");
                }
                await update();
            };
        }}
    >
        <!-- TMDB Section -->
        <div class="rounded-xl border border-border bg-card p-6 mb-6">
            <div class="flex items-center gap-3 mb-6">
                <Film class="w-5 h-5 text-primary" />
                <h2 class="text-lg font-semibold">The Movie Database (TMDB)</h2>
            </div>

            <div class="grid gap-6">
                <div>
                    <label for="tmdbApiKey" class="block text-sm text-muted-foreground mb-2">API Key</label>
                    <Input
                        id="tmdbApiKey"
                        name="tmdbApiKey"
                        type="password"
                        value={data.settings.tmdb.apiKey}
                        placeholder="TMDB API Key"
                    />
                    <p class="text-xs text-muted-foreground mt-2">
                        Get a free API key at
                        <a
                            href="https://www.themoviedb.org/settings/api"
                            target="_blank"
                            rel="noopener"
                            class="text-primary hover:underline"
                            >themoviedb.org</a
                        >
                    </p>
                </div>
            </div>
        </div>

        <!-- OpenSubtitles Section -->
        <div class="rounded-xl border border-border bg-card p-6 mb-6">
            <div class="flex items-center gap-3 mb-6">
                <Captions class="w-5 h-5 text-primary" />
                <h2 class="text-lg font-semibold">OpenSubtitles</h2>
            </div>

            <div class="grid gap-6">
                <div>
                    <label for="opensubtitlesApiKey" class="block text-sm text-muted-foreground mb-2">API Key</label>
                    <Input
                        id="opensubtitlesApiKey"
                        name="opensubtitlesApiKey"
                        type="password"
                        value={data.settings.opensubtitles.apiKey}
                        placeholder="OpenSubtitles API Key"
                    />
                    <p class="text-xs text-muted-foreground mt-2">
                        Get a free API key at
                        <a
                            href="https://www.opensubtitles.com/consumers"
                            target="_blank"
                            rel="noopener"
                            class="text-primary hover:underline"
                            >opensubtitles.com</a
                        >
                    </p>
                </div>
            </div>
        </div>

        <!-- Prowlarr Section -->
        <div class="rounded-xl border border-border bg-card p-6 mb-6">
            <div class="flex items-center gap-3 mb-6">
                <Server class="w-5 h-5 text-primary" />
                <h2 class="text-lg font-semibold">Prowlarr</h2>
            </div>

            <div class="grid gap-6">
                <div>
                    <label for="prowlarrUrl" class="block text-sm text-muted-foreground mb-2">URL</label>
                    <Input
                        id="prowlarrUrl"
                        name="prowlarrUrl"
                        type="url"
                        bind:value={prowlarrUrl}
                        placeholder="http://localhost:9696"
                    />
                </div>
                <div>
                    <label for="prowlarrApiKey" class="block text-sm text-muted-foreground mb-2">API Key</label>
                    <Input
                        id="prowlarrApiKey"
                        name="prowlarrApiKey"
                        type="password"
                        bind:value={prowlarrApiKey}
                        placeholder="Prowlarr API Key"
                    />
                    {#if !prowlarrApiKey}
                        <p class="text-xs text-muted-foreground mt-2">
                            Get the API key at
                            <a href={prowlarrUrl} target="_blank" rel="noopener" class="text-primary hover:underline"
                                >{prowlarrUrl}</a
                            >
                        </p>
                    {/if}
                </div>

                <div class="border-t pt-6 -mx-6 px-6">
                    <IndexerManager {prowlarrUrl} {prowlarrApiKey} />
                </div>

                <div>
                    <label for="prowlarrMinSeeders" class="block text-sm text-muted-foreground mb-2">
                        Minimum Seeders
                    </label>
                    <Input
                        id="prowlarrMinSeeders"
                        name="prowlarrMinSeeders"
                        type="number"
                        value={data.settings.prowlarr.minSeeders}
                        min="0"
                    />
                </div>
                <!-- <div>
                    <label
                        for="prowlarrTrustedGroups"
                        class="block text-sm text-muted-foreground mb-2"
                    >
                        Trusted Release Groups (comma separated)
                    </label>
                    <Input
                        id="prowlarrTrustedGroups"
                        name="prowlarrTrustedGroups"
                        type="text"
                        value={getTrustedGroupsString(
                            data.settings.prowlarr.trustedGroups,
                        )}
                        placeholder="YTS, YIFY, .BONE., x1337, TVTEAM"
                    />
                    <p class="text-xs text-muted-foreground mt-2">
                        Leave empty to allow all groups (not recommended for
                        quality).
                    </p>
                </div> -->
            </div>
        </div>

        <div class="flex justify-end">
            <Button type="submit" disabled={saving}>
                <Save class="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save Settings"}
            </Button>
        </div>
    </form>
</div>
