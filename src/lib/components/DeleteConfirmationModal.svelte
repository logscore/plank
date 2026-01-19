<script lang="ts">
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  let { open = $bindable(false), title, description, onConfirm, loading = false } = $props<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void | Promise<void>;
    loading?: boolean;
  }>();
</script>

<Dialog bind:open {title} {description}>
  <div class="flex justify-end gap-2 mt-4">
    <Button variant="ghost" onclick={() => (open = false)} disabled={loading}>
      Cancel
    </Button>
    <Button 
      variant="destructive" 
      onclick={async () => {
        await onConfirm();
        open = false;
      }}
      disabled={loading}
    >
      {loading ? 'Deleting...' : 'Delete'}
    </Button>
  </div>
</Dialog>
