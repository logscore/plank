<script lang="ts">
    import { goto } from '$app/navigation';
    import { authClient } from '$lib/auth-client';
    import Facehash from '$lib/components/facehash/Facehash.svelte';
    import OnboardingIndexer from '$lib/components/onboarding/OnboardingIndexer.svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import type { PageData } from './$types';

    let { data } = $props<{ data: PageData }>();

    let step = $state(1); // 1: Create Profile, 2: Indexers, 3: Invite
    let loading = $state(false);
    let error = $state('');

    // Profile form
    let profileName = $state('');
    let organizationId = $state('');

    // Invitation form
    let inviteEmail = $state('');
    let invitedEmails = $state<string[]>([]);

    async function handleCreateProfile(e: Event) {
        e.preventDefault();
        loading = true;
        error = '';

        try {
            const slug =
                profileName
                    .toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^a-z0-9-]/g, '') || `profile-${Date.now()}`;

            const result = await authClient.organization.create({
                name: profileName,
                slug,
            });

            if (result.error) {
                error = result.error.message || 'Failed to create profile';
            } else if (result.data) {
                organizationId = result.data.id;

                // Automatically set as active
                await authClient.organization.setActive({
                    organizationId: result.data.id,
                });
                step = 2;
            }
        } catch {
            error = 'An error occurred. Please try again.';
        } finally {
            loading = false;
        }
    }

    async function handleIndexersContinue() {
        step = 3;
    }

    async function handleInvite(e: Event) {
        e.preventDefault();
        if (!inviteEmail) {
            return;
        }

        loading = true;
        error = '';

        try {
            const result = await authClient.organization.inviteMember({
                email: inviteEmail,
                role: 'member',
                organizationId,
            });

            if (result.error) {
                error = result.error.message || 'Failed to invite member';
            } else {
                invitedEmails = [...invitedEmails, inviteEmail];
                inviteEmail = '';
            }
        } catch {
            error = 'An error occurred inviting member.';
        } finally {
            loading = false;
        }
    }

    async function handleFinish() {
        goto('/');
    }
</script>

<div class="flex items-center justify-center min-h-[80vh]">
    <div class="w-full max-w-md bg-card/50 backdrop-blur-xl rounded-xl p-8 border border-white/10 shadow-2xl">
        <div class="text-center mb-8">
            <h1 class="text-3xl font-bold tracking-tight">
                {#if step === 1}
                    Create Your First Profile
                {:else if step === 2}
                    Configure Indexers
                {:else}
                    Invite Members
                {/if}
            </h1>
            <p class="text-muted-foreground mt-2">
                {#if step === 1}
                    Set up a space for your media collection
                {:else if step === 2}
                    Add torrent sources to find content
                {:else}
                    Share access with others
                {/if}
            </p>
        </div>

        {#if step === 1}
            <form onsubmit={handleCreateProfile} class="space-y-4">
                {#if error}
                    <div
                        class="p-3 bg-destructive/15 border border-destructive/50 rounded-lg text-destructive text-sm text-center"
                    >
                        {error}
                    </div>
                {/if}

                <div class="space-y-4">
                    <div class="flex flex-col items-center gap-4">
                        <Facehash name={profileName || 'Profile'} size={96} class="rounded-xl text-white" enableBlink />
                    </div>

                    <div class="space-y-2">
                        <label for="profileName" class="text-sm font-medium leading-none">Profile Name</label>
                        <Input
                            type="text"
                            id="profileName"
                            bind:value={profileName}
                            required
                            placeholder="e.g. Family, Kids, Movie Night"
                            class="bg-background/50"
                        />
                    </div>
                </div>

                <Button type="submit" disabled={loading} class="w-full" size="lg">
                    {loading ? 'Creating...' : 'Create & Continue'}
                </Button>
            </form>
        {:else if step === 2}
            <div class="space-y-6">
                <div class="-mx-2">
                    <OnboardingIndexer
                        prowlarrUrl={data.settings.prowlarr.url}
                        prowlarrApiKey={data.settings.prowlarr.apiKey}
                    />
                </div>

                <div class="pt-4 border-t border-white/10 flex gap-4">
                    <Button onclick={handleIndexersContinue} class="w-full" size="lg">Continue</Button>
                </div>
            </div>
        {:else}
            <div class="space-y-6">
                <form onsubmit={handleInvite} class="space-y-4">
                    {#if error}
                        <div
                            class="p-3 bg-destructive/15 border border-destructive/50 rounded-lg text-destructive text-sm text-center"
                        >
                            {error}
                        </div>
                    {/if}

                    <div class="space-y-2">
                        <label for="inviteEmail" class="text-sm font-medium leading-none">Email Address</label>
                        <div class="flex gap-2">
                            <Input
                                type="email"
                                id="inviteEmail"
                                bind:value={inviteEmail}
                                placeholder="friend@example.com"
                                class="bg-background/50"
                            />
                            <Button type="submit" disabled={loading || !inviteEmail} variant="secondary">Invite</Button>
                        </div>
                    </div>
                </form>

                {#if invitedEmails.length > 0}
                    <div class="space-y-2">
                        <h2 class="text-sm font-medium text-muted-foreground">Invited</h2>
                        <div class="space-y-1">
                            {#each invitedEmails as email}
                                <div
                                    class="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5"
                                >
                                    <span class="text-sm">{email}</span>
                                    <span class="text-xs text-muted-foreground">Pending</span>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                <div class="pt-4 border-t border-white/10">
                    <Button onclick={handleFinish} class="w-full" size="lg">Finish Setup</Button>
                </div>
            </div>
        {/if}
    </div>
</div>
