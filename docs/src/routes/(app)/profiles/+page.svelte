<script lang="ts">
    import { Settings } from '@lucide/svelte';
    import { goto } from '$app/navigation';
    import ProfileCard from '$lib/components/ProfileCard.svelte';
    import { demoStore } from '$lib/demo/store.svelte';

    async function handleSelectProfile(profileId: string) {
        demoStore.setActiveProfile(profileId);
        await goto('/');
    }
</script>

<div
    class="mx-auto flex min-h-[calc(100vh-6rem)] max-w-6xl flex-col items-center justify-center px-6 py-12 text-center"
>
    <div class="mb-10 space-y-3">
        <h1 class="text-4xl font-semibold tracking-tight sm:text-5xl">Who's watching?</h1>
        <p class="text-sm text-muted-foreground sm:text-base">Pick a profile. Each one has its own local library.</p>
    </div>

    <div class="grid grid-cols-2 gap-8 sm:grid-cols-3">
        {#each demoStore.profiles as profile}
            <ProfileCard
                name={profile.name}
                logo={profile.logo}
                isMember={profile.isMember}
                onclick={() => handleSelectProfile(profile.id)}
            />
        {/each}
    </div>

    <div class="mt-10 flex flex-wrap items-center justify-center gap-3">
        <a
            href="/profiles/manage"
            class="inline-flex h-10 items-center justify-center rounded-md border border-input px-4 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground"
            >Manage Profiles</a
        >
    </div>
</div>
