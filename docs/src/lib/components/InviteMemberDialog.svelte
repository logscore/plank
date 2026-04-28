<script lang="ts">
    import { Check, Copy } from '@lucide/svelte';
    import { demoStore } from '$lib/demo/store.svelte';
    import { uiState } from '$lib/ui-state.svelte';
    import Button from './ui/Button.svelte';
    import Dialog from './ui/Dialog.svelte';
    import Input from './ui/Input.svelte';

    let email = $state('');
    let error = $state('');
    let inviteLink = $state('');
    let copied = $state(false);

    function handleInvite(e: Event) {
        e.preventDefault();
        const result = demoStore.createInvitation(email);
        if (!result) {
            error = 'Select a profile and provide an email address.';
            return;
        }

        error = '';
        inviteLink = `${window.location.origin}/accept-invitation/${result.id}`;
    }

    async function copyLink() {
        await navigator.clipboard.writeText(inviteLink);
        copied = true;
        setTimeout(() => {
            copied = false;
        }, 2000);
    }

    function close() {
        uiState.inviteMemberDialogOpen = false;
        email = '';
        inviteLink = '';
        error = '';
    }
</script>

<Dialog bind:open={uiState.inviteMemberDialogOpen} title="Invite Member">
    {#if !inviteLink}
        <form onsubmit={handleInvite} class="mt-4 space-y-4">
            {#if error}
                <div
                    class="rounded-lg border border-destructive/50 bg-destructive/15 p-3 text-center text-sm text-destructive"
                >
                    {error}
                </div>
            {/if}

            <div class="space-y-2">
                <label for="invite-email" class="text-sm font-medium">Email Address</label>
                <Input
                    id="invite-email"
                    type="email"
                    bind:value={email}
                    placeholder="friend@example.com"
                    required
                    class="bg-background/50"
                />
                <p class="text-xs text-muted-foreground">
                    This creates a shareable invite link and stores it locally in this browser.
                </p>
            </div>

            <div class="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onclick={close}>Cancel</Button>
                <Button type="submit">Create Invite</Button>
            </div>
        </form>
    {:else}
        <div class="mt-4 space-y-4">
            <div class="rounded-lg border border-green-500/20 bg-green-500/10 p-4 text-center">
                <h3 class="mb-1 font-medium text-green-400">Invitation Created</h3>
                <p class="text-sm text-muted-foreground">Share this link with {email}</p>
            </div>

            <div class="flex gap-2">
                <Input value={inviteLink} readonly class="bg-background/50" />
                <Button onclick={copyLink} variant="secondary" class="shrink-0">
                    {#if copied}
                        <Check class="h-4 w-4" />
                    {:else}
                        <Copy class="h-4 w-4" />
                    {/if}
                </Button>
            </div>

            <div class="flex justify-end pt-2">
                <Button onclick={close}>Done</Button>
            </div>
        </div>
    {/if}
</Dialog>
