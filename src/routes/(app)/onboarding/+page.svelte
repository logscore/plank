<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { authClient } from '$lib/auth-client';
    import IndexerManager from '$lib/components/IndexerManager.svelte';
    import OnboardingIndexer from '$lib/components/onboarding/OnboardingIndexer.svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import type { PageData } from './$types';

    let { data } = $props<{ data: PageData }>();

    let step = $state(1); // 1: Create Org, 2: Indexers, 3: Invite
    let loading = $state(false);
    let error = $state('');

    // Organization form
    let orgName = $state('');
    let orgSlug = $state('');
    let organizationId = $state('');

    // Invitation form
    let inviteEmail = $state('');
    let invitedEmails = $state<string[]>([]);

    async function handleCreateOrg(e: Event) {
        e.preventDefault();
        loading = true;
        error = '';

        try {
            console.log('Creating organization:', { name: orgName, slug: orgSlug });
            const result = await authClient.organization.create({
                name: orgName,
                slug: orgSlug || orgName.toLowerCase().replace(/\s+/g, '-'),
            });
            console.log('Organization creation result:', result);

            if (result.error) {
                error = result.error.message || 'Failed to create organization';
            } else if (result.data) {
                organizationId = result.data.id;
                // Automatically set as active
                await authClient.organization.setActive({
                    organizationId: result.data.id,
                });
                step = 2;
            }
        } catch (e) {
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
        } catch (e) {
            error = 'An error occurred inviting member.';
        } finally {
            loading = false;
        }
    }

    async function handleFinish() {
        goto('/');
    }

    // Auto-generate slug from name
    $effect(() => {
        if (step === 1 && orgName && !orgSlug) {
            // Only auto-update if user hasn't manually edited slug (simplified logic here)
            // simplified: just suggest it in placeholder or let backend handle if empty
        }
    });
</script>

<div class="flex items-center justify-center min-h-[80vh]">
    <div class="w-full max-w-md bg-card/50 backdrop-blur-xl rounded-xl p-8 border border-white/10 shadow-2xl">
        <div class="text-center mb-8">
            <h1 class="text-3xl font-bold tracking-tight">
                {#if step === 1}
                    Setup Organization
                {:else if step === 2}
                    Configure Indexers
                {:else}
                    Invite Team
                {/if}
            </h1>
            <p class="text-muted-foreground mt-2">
                {#if step === 1}
                    Create a space for your media
                {:else if step === 2}
                    Add torrent sources to find content
                {:else}
                    Share access with others
                {/if}
            </p>
        </div>

        {#if step === 1}
            <form onsubmit={handleCreateOrg} class="space-y-4">
                {#if error}
                    <div
                        class="p-3 bg-destructive/15 border border-destructive/50 rounded-lg text-destructive text-sm text-center"
                    >
                        {error}
                    </div>
                {/if}

                <div class="space-y-4">
                    <div class="space-y-2">
                        <label for="orgName" class="text-sm font-medium leading-none">Organization Name</label>
                        <Input
                            type="text"
                            id="orgName"
                            bind:value={orgName}
                            required
                            placeholder="My Movie Club"
                            class="bg-background/50"
                        />
                    </div>

                    <div class="space-y-2">
                        <label for="orgSlug" class="text-sm font-medium leading-none">Slug (Optional)</label>
                        <Input
                            type="text"
                            id="orgSlug"
                            bind:value={orgSlug}
                            placeholder={orgName ? orgName.toLowerCase().replace(/\s+/g, '-') : 'my-movie-club'}
                            class="bg-background/50"
                        />
                        <p class="text-xs text-muted-foreground">Unique identifier for your organization URL</p>
                    </div>
                </div>

                <Button type="submit" disabled={loading} class="w-full" size="lg">
                    {loading ? 'Creating...' : 'Create & Continue'}
                </Button>
            </form>
        {:else if step === 2}
            <div class="space-y-6">
                <!-- Use the custom OnboardingIndexer component -->
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
