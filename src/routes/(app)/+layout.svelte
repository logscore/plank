<script lang="ts">
  import { goto } from '$app/navigation';
  import { authClient } from '$lib/auth-client';
  import Layout from '$lib/components/Layout.svelte';
  import '../../app.css';

  let { children } = $props();

  async function handleLogout() {
    await authClient.signOut();
    goto('/login');
  }
</script>

<Layout logout={handleLogout}>{@render children()}</Layout>
