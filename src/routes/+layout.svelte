<script lang="ts">
    import '../app.css';
    import { Toaster } from 'svelte-sonner';
    import QueryProvider from '$lib/components/QueryProvider.svelte';

    let { children } = $props();
</script>

<QueryProvider>
    {@render children()}
    <Toaster richColors position="bottom-left" duration={2500} />
</QueryProvider>
