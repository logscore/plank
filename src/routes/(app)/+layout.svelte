<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { authClient } from '$lib/auth-client';
    import AddMediaDialog from '$lib/components/AddMediaDialog.svelte';
    import ConfirmationDialog from '$lib/components/ConfirmationDialog.svelte';
    import InviteMemberDialog from '$lib/components/InviteMemberDialog.svelte';
    import Layout from '$lib/components/Layout.svelte';
    import { prefetchBrowseData } from '$lib/prefetch';
    import '../../app.css';

    let { children } = $props();

    const APP_NAME = 'Plank';
    const ROUTE_TITLES: Record<string, string> = {
        '/': 'Home',
        '/account': 'Account',
        '/browse': 'Browse',
        '/onboarding': 'Onboarding',
        '/profiles': 'Profiles',
        '/profiles/manage': 'Manage Profiles',
        '/search': 'Search',
        '/settings': 'Settings',
    };

    const pageTitle = $derived.by(() => {
        const routeTitle = ROUTE_TITLES[page.url.pathname];
        if (routeTitle) {
            return `${APP_NAME} - ${routeTitle}`;
        }
        return APP_NAME;
    });

    // Prefetch browse data eagerly so it's ready when the user navigates to /browse
    prefetchBrowseData();

    async function handleLogout() {
        await authClient.signOut();
        goto('/login');
    }
</script>

<svelte:head>
    <title>{pageTitle} | Plank</title>
</svelte:head>

<Layout logout={handleLogout}>
    {@render children()}
    <InviteMemberDialog />
    <ConfirmationDialog />
    <AddMediaDialog />
</Layout>
