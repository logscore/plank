<script lang="ts">
    import { goto } from '$app/navigation';
    import { authClient } from '$lib/auth-client';
    import AddMediaDialog from '$lib/components/AddMediaDialog.svelte';
    import ConfirmationDialog from '$lib/components/ConfirmationDialog.svelte';
    import InviteMemberDialog from '$lib/components/InviteMemberDialog.svelte';
    import Layout from '$lib/components/Layout.svelte';
    import { prefetchBrowseData } from '$lib/prefetch';
    import '../../app.css';

    let { children } = $props();

    // Prefetch browse data eagerly so it's ready when the user navigates to /browse
    prefetchBrowseData();

    async function handleLogout() {
        await authClient.signOut();
        goto('/login');
    }
</script>

<Layout logout={handleLogout}>
    {@render children()}
    <InviteMemberDialog />
    <ConfirmationDialog />
    <AddMediaDialog />
</Layout>
