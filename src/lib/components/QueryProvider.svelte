<script lang="ts">
    import { QueryClientProvider } from '@tanstack/svelte-query';
    import { SvelteQueryDevtools } from '@tanstack/svelte-query-devtools';
    import type { Snippet } from 'svelte';
    import { dev } from '$app/environment';
    import { queryClient } from '$lib/query-client';

    interface Props {
        children: Snippet;
    }

    let { children }: Props = $props();
</script>

<QueryClientProvider client={queryClient}>
    {@render children()}
    {#if dev}
        <SvelteQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    {/if}
</QueryClientProvider>
