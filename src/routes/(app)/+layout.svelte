<script lang="ts">
  import { authClient } from '$lib/auth-client';
  import { goto } from '$app/navigation';
  import Layout from '$lib/components/Layout.svelte';
  import '../../app.css';

  let { children } = $props();

  async function handleLogout() {
    await authClient.signOut();
    goto('/login');
  }
</script>

<Layout logout={handleLogout}>
  {@render children()}
</Layout>
