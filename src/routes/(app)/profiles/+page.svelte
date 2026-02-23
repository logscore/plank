<script lang="ts">
    import { LogOut, Plus, Settings } from '@lucide/svelte';
    import { toast } from 'svelte-sonner';
    import { goto } from '$app/navigation';
    import { authClient } from '$lib/auth-client';
    import ProfileCard from '$lib/components/ProfileCard.svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import { queryClient } from '$lib/query-client';
    import type { PageData } from './$types';

    let { data } = $props<{ data: PageData }>();

    async function selectProfile(profileId: string) {
        try {
            const result = await authClient.organization.setActive({
                organizationId: profileId,
            });
            if (result.error) {
                toast.error('Failed to select profile');
                return;
            }
            queryClient.clear();
            goto('/');
        } catch {
            toast.error('Failed to select profile');
        }
    }

    async function handleLogout() {
        await authClient.signOut();
        goto('/login');
    }

    const accessibleProfiles = $derived(data.profiles.filter((p: (typeof data.profiles)[number]) => p.isMember));
    const hasProfiles = $derived(data.profiles.length > 0);
</script>

<div class="min-h-screen flex flex-col items-center justify-center px-4">
    {#if !hasProfiles && !data.isAdmin}
        <!-- Non-admin with no profiles: waiting state -->
        <div class="text-center max-w-md">
            <div class="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-6">
                <Settings class="w-10 h-10 text-muted-foreground" />
            </div>
            <h1 class="text-2xl font-bold mb-3">Waiting for Access</h1>
            <p class="text-muted-foreground mb-8">
                An admin needs to invite you to a profile before you can start watching.
            </p>
            <Button variant="outline" onclick={handleLogout}>
                <LogOut class="w-4 h-4 mr-2" />
                Sign Out
            </Button>
        </div>
    {:else}
        <!-- Profile picker -->
        <div class="text-center mb-12">
            <h1 class="text-3xl md:text-4xl font-bold tracking-tight">Who's watching?</h1>
        </div>

        <div
            class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 md:gap-8 mb-12 overflow-scroll p-4 max-h-100"
        >
            {#each data.profiles as profile}
                <ProfileCard
                    name={profile.name}
                    isMember={profile.isMember}
                    onclick={() => selectProfile(profile.id)}
                />
            {/each}
        </div>

        {#if data.isAdmin}
            <div class="flex gap-4">
                <Button variant="outline" onclick={() => goto("/profiles/manage")}>
                    <Plus class="w-4 h-4 mr-2" />
                    Manage Profiles
                </Button>
            </div>
        {/if}
    {/if}
</div>
