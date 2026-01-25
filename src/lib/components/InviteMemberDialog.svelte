<script lang="ts">
    import { Check, Copy } from '@lucide/svelte';
    import { onMount } from 'svelte';
    import { authClient } from '$lib/auth-client';
    import { uiState } from '$lib/ui-state.svelte';
    import Button from './ui/Button.svelte';
    import Dialog from './ui/Dialog.svelte';
    import Input from './ui/Input.svelte';

    let email = $state('');
    let loading = $state(false);
    let error = $state('');
    let inviteLink = $state('');
    let copied = $state(false);
    let activeOrganizationId = $state('');

    onMount(async () => {
        // Fetch active organization ID
        const session = await authClient.getSession();
        if (session.data?.session?.activeOrganizationId) {
            activeOrganizationId = session.data.session.activeOrganizationId;
        } else {
            // Try fetching organizations list if not active
            const orgs = await authClient.organization.list();
            if (orgs.data && orgs.data.length > 0) {
                activeOrganizationId = orgs.data[0].id;
            }
        }
    });

    async function handleInvite(e: Event) {
        e.preventDefault();
        if (!(email && activeOrganizationId)) {
            return;
        }

        loading = true;
        error = '';
        inviteLink = '';

        try {
            const result = await authClient.organization.inviteMember({
                email,
                role: 'member',
                organizationId: activeOrganizationId,
            });

            if (result.error) {
                error = result.error.message || 'Failed to create invitation';
            } else if (result.data) {
                const origin = window.location.origin;
                inviteLink = `${origin}/accept-invitation/${result.data.id}`;
            }
        } catch (e) {
            error = 'An error occurred';
        } finally {
            loading = false;
        }
    }

    function copyLink() {
        navigator.clipboard.writeText(inviteLink);
        copied = true;
        setTimeout(() => {
            copied = false;
        }, 2000);
    }

    function close() {
        uiState.inviteMemberDialogOpen = false;
        // Reset state
        email = '';
        inviteLink = '';
        error = '';
    }
</script>

<Dialog bind:open={uiState.inviteMemberDialogOpen} title="Invite Member">
    {#if !inviteLink}
        <form onsubmit={handleInvite} class="space-y-4 mt-4">
            {#if error}
                <div
                    class="p-3 bg-destructive/15 border border-destructive/50 rounded-lg text-destructive text-sm text-center"
                >
                    {error}
                </div>
            {/if}

            <div class="space-y-2">
                <label for="invite-email" class="text-sm font-medium">Email Address</label>
                <Input
                    type="email"
                    id="invite-email"
                    bind:value={email}
                    placeholder="friend@example.com"
                    required
                    class="bg-background/50"
                />
                <p class="text-xs text-muted-foreground">Enter the email address of the person you want to invite.</p>
            </div>

            <div class="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onclick={close}>Cancel</Button>
                <Button type="submit" disabled={loading || !activeOrganizationId}>
                    {loading ? "Creating..." : "Create Invite"}
                </Button>
            </div>
        </form>
    {:else}
        <div class="space-y-4 mt-4">
            <div class="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-center">
                <h3 class="text-green-400 font-medium mb-1">Invitation Created!</h3>
                <p class="text-sm text-muted-foreground">Share this link with {email}</p>
            </div>

            <div class="flex gap-2">
                <Input value={inviteLink} readonly class="bg-background/50" />
                <Button onclick={copyLink} variant="secondary" class="shrink-0">
                    {#if copied}
                        <Check class="w-4 h-4" />
                    {:else}
                        <Copy class="w-4 h-4" />
                    {/if}
                </Button>
            </div>

            <div class="flex justify-end pt-2">
                <Button onclick={close}>Done</Button>
            </div>
        </div>
    {/if}
</Dialog>
