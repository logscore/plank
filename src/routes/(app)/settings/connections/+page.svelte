<script lang="ts">
    import { CircleAlert, CircleCheck, CircleDashed, Loader } from "@lucide/svelte";
    import type { SubmitFunction } from "@sveltejs/kit";
    import { untrack } from "svelte";
    import { toast } from "svelte-sonner";
    import { enhance } from "$app/forms";
    import Button from "$lib/components/ui/Button.svelte";
    import Input from "$lib/components/ui/Input.svelte";
    import { type ConnectionTarget, createTestSettingsConnectionMutation } from "$lib/data/settings";
    import Section from "../Section.svelte";
    import type { PageData } from "./$types";
    import SecretField from "./SecretField.svelte";

    type TestState = "idle" | "loading" | "success" | "error";

    let { data } = $props<{ data: PageData }>();
    const testConnectionMutation = createTestSettingsConnectionMutation();

    function formValues() {
        return {
            tmdbApiKey: data.settings.tmdb.apiKey,
            opensubtitlesApiKey: data.settings.opensubtitles.apiKey,
            opensubtitlesUsername: data.settings.opensubtitles.username,
            opensubtitlesPassword: data.settings.opensubtitles.password,
            prowlarrUrl: data.settings.prowlarr.url,
            prowlarrApiKey: data.settings.prowlarr.apiKey,
            prowlarrMinSeeders: String(data.settings.prowlarr.minSeeders),
        };
    }

    // Seeded once. A save reloads data.settings, which clears `dirty` on its own.
    let values = $state(untrack(() => formValues()));
    let testStates = $state<Record<ConnectionTarget, TestState>>({
        tmdb: "idle",
        opensubtitles: "idle",
        prowlarr: "idle",
    });
    let savingTarget = $state<ConnectionTarget | null>(null);

    const configured = $derived<Record<ConnectionTarget, boolean>>({
        tmdb: values.tmdbApiKey.length > 0,
        opensubtitles: values.opensubtitlesApiKey.length > 0,
        prowlarr: values.prowlarrUrl.length > 0 && values.prowlarrApiKey.length > 0,
    });
    const dirty = $derived<Record<ConnectionTarget, boolean>>({
        tmdb: values.tmdbApiKey !== data.settings.tmdb.apiKey,
        opensubtitles:
            values.opensubtitlesApiKey !== data.settings.opensubtitles.apiKey ||
            values.opensubtitlesUsername !== data.settings.opensubtitles.username ||
            values.opensubtitlesPassword !== data.settings.opensubtitles.password,
        prowlarr:
            values.prowlarrUrl !== data.settings.prowlarr.url ||
            values.prowlarrApiKey !== data.settings.prowlarr.apiKey ||
            values.prowlarrMinSeeders !== String(data.settings.prowlarr.minSeeders),
    });

    function statusLabel(target: ConnectionTarget): string {
        const state = testStates[target];
        if (state === "loading") {
            return "Testing";
        }
        if (state === "success") {
            return "Connected";
        }
        if (state === "error") {
            return "Connection failed";
        }
        return configured[target] ? "Not tested" : "Not configured";
    }

    async function testConnection(target: ConnectionTarget): Promise<void> {
        testStates[target] = "loading";

        try {
            const result = await testConnectionMutation.mutateAsync({
                target,
                tmdbApiKey: values.tmdbApiKey,
                prowlarrUrl: values.prowlarrUrl,
                prowlarrApiKey: values.prowlarrApiKey,
                opensubtitlesApiKey: values.opensubtitlesApiKey,
                opensubtitlesUsername: values.opensubtitlesUsername,
                opensubtitlesPassword: values.opensubtitlesPassword,
            });
            testStates[target] = result.success ? "success" : "error";
        } catch {
            testStates[target] = "error";
        }
    }

    function submitConnection(target: ConnectionTarget): SubmitFunction {
        return () => {
            savingTarget = target;
            return async ({ result, update }) => {
                savingTarget = null;
                if (result.type === "success") {
                    toast.success("Connection saved");
                } else {
                    const message =
                        result.type === "failure" && typeof result.data?.error === "string"
                            ? result.data.error
                            : "Failed to save the connection";
                    toast.error(message);
                }
                await update({ reset: false });
            };
        };
    }
</script>

{#snippet status(target: ConnectionTarget)}
    <span class="inline-flex items-center gap-2 text-sm">
        {#if testStates[target] === "loading"}
            <Loader class="size-4 animate-spin text-muted-foreground" />
        {:else if testStates[target] === "success"}
            <CircleCheck class="size-4 text-green-500" />
        {:else if testStates[target] === "error"}
            <CircleAlert class="size-4 text-destructive" />
        {:else}
            <CircleDashed class="size-4 text-muted-foreground" />
        {/if}
        <span class={testStates[target] === "error" ? "text-destructive" : "text-muted-foreground"}>
            {statusLabel(target)}
        </span>
    </span>
{/snippet}

{#snippet footer(target: ConnectionTarget)}
    <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={testStates[target] === "loading"}
            onclick={() => testConnection(target)}
        >
            Test connection
        </Button>
        <Button type="submit" size="sm" disabled={!dirty[target] || savingTarget === target}>
            {#if savingTarget === target}
                <Loader class="mr-2 size-4 animate-spin" />
            {/if}
            Save
        </Button>
    </div>
{/snippet}

<div class="divide-y divide-white/10">
    <Section title="TMDB" description="Titles, posters, and metadata.">
        {#snippet action()}
            {@render status("tmdb")}
        {/snippet}

        <form method="POST" action="?/tmdb" class="max-w-md space-y-5" use:enhance={submitConnection("tmdb")}>
            <SecretField
                id="tmdbApiKey"
                name="tmdbApiKey"
                label="API key"
                bind:value={values.tmdbApiKey}
                placeholder="TMDB API key"
            />
            <p class="text-xs text-muted-foreground">
                Create one at
                <a
                    href="https://www.themoviedb.org/settings/api"
                    target="_blank"
                    rel="noopener"
                    class="text-foreground underline underline-offset-4 hover:text-primary"
                >
                    themoviedb.org
                </a>
            </p>
            {@render footer("tmdb")}
        </form>
    </Section>

    <Section title="OpenSubtitles" description="Subtitle search and downloads.">
        {#snippet action()}
            {@render status("opensubtitles")}
        {/snippet}

        <form
            method="POST"
            action="?/opensubtitles"
            class="max-w-md space-y-5"
            use:enhance={submitConnection("opensubtitles")}
        >
            <SecretField
                id="opensubtitlesApiKey"
                name="opensubtitlesApiKey"
                label="API key"
                bind:value={values.opensubtitlesApiKey}
                placeholder="OpenSubtitles API key"
            />
            <p class="text-xs text-muted-foreground">
                Create one at
                <a
                    href="https://www.opensubtitles.com/consumers"
                    target="_blank"
                    rel="noopener"
                    class="text-foreground underline underline-offset-4 hover:text-primary"
                >
                    opensubtitles.com
                </a>
            </p>
            <div>
                <label for="opensubtitlesUsername" class="mb-2 block text-sm font-medium">Username</label>
                <Input
                    id="opensubtitlesUsername"
                    name="opensubtitlesUsername"
                    type="text"
                    autocomplete="off"
                    bind:value={values.opensubtitlesUsername}
                    placeholder="OpenSubtitles username"
                />
            </div>
            <SecretField
                id="opensubtitlesPassword"
                name="opensubtitlesPassword"
                label="Password"
                autocomplete="current-password"
                bind:value={values.opensubtitlesPassword}
                placeholder="OpenSubtitles password"
            />
            {@render footer("opensubtitles")}
        </form>
    </Section>

    <Section title="Prowlarr" description="Indexers and torrent discovery.">
        {#snippet action()}
            {@render status("prowlarr")}
        {/snippet}

        <form method="POST" action="?/prowlarr" class="max-w-md space-y-5" use:enhance={submitConnection("prowlarr")}>
            <div>
                <label for="prowlarrUrl" class="mb-2 block text-sm font-medium">URL</label>
                <Input
                    id="prowlarrUrl"
                    name="prowlarrUrl"
                    type="url"
                    bind:value={values.prowlarrUrl}
                    placeholder="http://localhost:9696"
                />
            </div>
            <SecretField
                id="prowlarrApiKey"
                name="prowlarrApiKey"
                label="API key"
                bind:value={values.prowlarrApiKey}
                placeholder="Prowlarr API key"
            />
            <div>
                <label for="prowlarrMinSeeders" class="mb-2 block text-sm font-medium">Minimum seeders</label>
                <Input
                    id="prowlarrMinSeeders"
                    name="prowlarrMinSeeders"
                    type="number"
                    min="0"
                    class="tabular-nums"
                    bind:value={values.prowlarrMinSeeders}
                />
                <p class="mt-2 text-xs text-muted-foreground">Plank ignores torrents with fewer seeders than this.</p>
            </div>
            <p class="text-xs text-muted-foreground">
                Manage the indexer list in
                <a href="/settings/indexers" class="text-foreground underline underline-offset-4 hover:text-primary">
                    Indexers
                </a>.
            </p>
            {@render footer("prowlarr")}
        </form>
    </Section>
</div>
