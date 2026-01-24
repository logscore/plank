<script lang="ts">
    import '../app.css';
    import QueryProvider from '$lib/components/QueryProvider.svelte';

    let { children } = $props();
</script>

<QueryProvider>{@render children()}</QueryProvider>
