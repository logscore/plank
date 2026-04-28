<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import ConfirmationDialog from '$lib/components/ConfirmationDialog.svelte';
    import InviteMemberDialog from '$lib/components/InviteMemberDialog.svelte';
    import Layout from '$lib/components/Layout.svelte';
    import { demoStore } from '$lib/demo/store.svelte';

    let { children } = $props();

    const routeTitles: Record<string, string> = {
        '/': 'Library',
        '/browse': 'Browse',
        '/search': 'Search',
        '/account': 'Account',
        '/settings': 'Settings',
        '/profiles': 'Profiles',
        '/profiles/manage': 'Manage Profiles',
    };

    const currentTitle = $derived(routeTitles[page.url.pathname] ?? 'Plank');

    $effect(() => {
        if (!demoStore.initialized) {
            return;
        }

        const path = page.url.pathname;
        const needsProfile = !path.startsWith('/profiles');
        if (needsProfile && !demoStore.activeProfileId) {
            goto('/profiles');
        }
    });
</script>

<svelte:head>
    <title>{currentTitle} · Plank</title>
</svelte:head>

<Layout>{@render children()}</Layout>

<InviteMemberDialog />
<ConfirmationDialog />
