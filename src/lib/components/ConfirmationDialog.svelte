<script lang="ts">
    import { uiState } from '$lib/ui-state.svelte';
    import Button from './ui/Button.svelte';
    import Dialog from './ui/Dialog.svelte';

    let loading = $state(false);

    async function handleConfirm() {
        if (uiState.deleteConfirmation.confirmAction) {
            loading = true;
            try {
                await uiState.deleteConfirmation.confirmAction();
            } finally {
                loading = false;
            }
        }
        uiState.deleteConfirmation.open = false;
    }

    function handleCancel() {
        uiState.deleteConfirmation.open = false;
    }
</script>

<Dialog
    bind:open={uiState.deleteConfirmation.open}
    title={uiState.deleteConfirmation.title}
    description={uiState.deleteConfirmation.description}
>
    <div class="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onclick={handleCancel} disabled={loading}>Cancel</Button>
        <Button variant="destructive" onclick={handleConfirm} disabled={loading}>
            {loading ? 'Processing...' : 'Confirm'}
        </Button>
    </div>
</Dialog>
