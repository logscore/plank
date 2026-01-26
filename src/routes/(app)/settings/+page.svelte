<script lang="ts">
    import { Film, Save, Server, Settings } from '@lucide/svelte';
    import { toast } from 'svelte-sonner';
    import { enhance } from '$app/forms';
    import Button from '$lib/components/ui/Button.svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import { LANGUAGES } from '$lib/constants';
    import type { PageData } from './$types';

    let { data } = $props<{ data: PageData }>();

    let saving = $state(false);

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
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label for="tmdbLanguage" class="block text-sm text-muted-foreground mb-2">
                            Torrent Language
                        </label>
                        <select
                            id="tmdbLanguage"
                            name="tmdbLanguage"
                            value={data.settings.tmdb.language.split("-")[0]}
                            class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {#each LANGUAGES as lang}
                                <option value={lang.code}>{lang.name}</option>
                            {/each}
                        </select>
                        <p class="text-xs text-muted-foreground mt-1">Default: English</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Jackett Section -->
        <div class="rounded-xl border border-border bg-card p-6 mb-6">
            <div class="flex items-center gap-3 mb-6">
                <Server class="w-5 h-5 text-primary" />
                <h2 class="text-lg font-semibold">Jackett</h2>
            </div>

            <div class="grid gap-6">
                <div>
                    <label for="jackettUrl" class="block text-sm text-muted-foreground mb-2">URL</label>
                    <Input
                        id="jackettUrl"
                        name="jackettUrl"
                        type="url"
                        value={data.settings.jackett.url}
                        placeholder="http://localhost:9117"
                    />
                </div>
                <div>
                    <label for="jackettApiKey" class="block text-sm text-muted-foreground mb-2">API Key</label>
                    <Input
                        id="jackettApiKey"
                        name="jackettApiKey"
                        type="password"
                        value={data.settings.jackett.apiKey}
                        placeholder="Jackett API Key"
                    />
                </div>
                <div>
                    <label for="jackettMinSeeders" class="block text-sm text-muted-foreground mb-2">
                        Minimum Seeders
                    </label>
                    <Input
                        id="jackettMinSeeders"
                        name="jackettMinSeeders"
                        type="number"
                        value={data.settings.jackett.minSeeders}
                        min="0"
                    />
                </div>
                <div>
                    <label for="jackettTrustedGroups" class="block text-sm text-muted-foreground mb-2">
                        Trusted Release Groups (comma separated)
                    </label>
                    <Input
                        id="jackettTrustedGroups"
                        name="jackettTrustedGroups"
                        type="text"
                        value={getTrustedGroupsString(
                            data.settings.jackett.trustedGroups,
                        )}
                        placeholder="YTS, YIFY, .BONE., x1337, TVTEAM"
                    />
                    <p class="text-xs text-muted-foreground mt-2">
                        Leave empty to allow all groups (not recommended for quality).
                    </p>
                </div>
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
