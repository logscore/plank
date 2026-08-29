<script lang="ts">
    import { AlertDialog } from "bits-ui";
    import { toast } from "svelte-sonner";
    import { uiState } from "$lib/ui-state.svelte";

    let loading = $state(false);

    const confirmClass = $derived(
        uiState.confirmation.tone === "destructive"
            ? "bg-destructive text-destructive-foreground hover:bg-destructive/85"
            : "bg-white/10 text-white hover:bg-white/20"
    );

    async function handleConfirm(event: MouseEvent) {
        event.preventDefault();
        if (loading) {
            return;
        }

        loading = true;
        try {
            await uiState.confirmation.confirmAction();
            uiState.confirmation.open = false;
        } catch (error) {
            // Stay open so the user can retry or cancel.
            console.error("Confirmation action failed:", error);
            toast.error(error instanceof Error ? error.message : "The action failed");
        } finally {
            loading = false;
        }
    }
</script>

<AlertDialog.Root bind:open={uiState.confirmation.open}>
    <AlertDialog.Portal>
        <AlertDialog.Overlay class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <AlertDialog.Content
            class="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-6 rounded-2xl border border-white/10 bg-zinc-950 p-6 text-foreground shadow-2xl focus:outline-none"
        >
            <div class="space-y-2">
                <AlertDialog.Title class="text-xl font-semibold tracking-tight">
                    {uiState.confirmation.title}
                </AlertDialog.Title>
                <AlertDialog.Description class="text-sm leading-relaxed text-muted-foreground">
                    {uiState.confirmation.description}
                </AlertDialog.Description>
            </div>

            <div class="flex justify-end gap-2">
                <AlertDialog.Cancel
                    disabled={loading}
                    class="inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium text-muted-foreground transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                    Cancel
                </AlertDialog.Cancel>
                <AlertDialog.Action
                    disabled={loading}
                    onclick={handleConfirm}
                    class="inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 {confirmClass}"
                >
                    {loading ? "Working..." : uiState.confirmation.confirmLabel}
                </AlertDialog.Action>
            </div>
        </AlertDialog.Content>
    </AlertDialog.Portal>
</AlertDialog.Root>
