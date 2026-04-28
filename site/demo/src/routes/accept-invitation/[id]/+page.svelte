<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import Button from '$lib/components/ui/Button.svelte';
    import { demoStore } from '$lib/demo/store.svelte';

    const inviteId = $derived(page.params.id ?? '');
    const invite = $derived(
        demoStore.getInvitations(null).find((item: { id: string }) => item.id === inviteId) ?? null
    );

    async function acceptInvite() {
        if (invite) {
            demoStore.acceptInvitation(invite.id);
        }
        await goto('/profiles');
    }
</script>

<div class="flex min-h-[calc(100vh-6rem)] items-center justify-center px-6 py-12">
    <div class="w-full max-w-xl rounded-2xl border border-white/10 bg-card/60 p-8 text-center shadow-xl">
        {#if invite}
            <h1 class="text-3xl font-semibold">Join {invite.profileName}</h1>
            <p class="mt-3 text-sm text-muted-foreground">Accepting this invite adds you to this account.</p>
            <div class="mt-6 flex justify-center gap-3">
                <Button onclick={acceptInvite}>Accept Invitation</Button>
            </div>
        {:else}
            <h1 class="text-3xl font-semibold">Invitation not found</h1>
            <p class="mt-3 text-sm text-muted-foreground">The invite may have expired or been revoked.</p>
            <div class="mt-6 flex justify-center gap-3"><a href="/profiles"
                ><Button>Open Profiles</Button></a
            ></div>
        {/if}
    </div>
</div>
