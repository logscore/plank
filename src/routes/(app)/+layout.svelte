<script lang="ts">
  import { authClient } from '$lib/auth-client';
  import { goto } from '$app/navigation';

  let { children } = $props();

  async function handleLogout() {
    await authClient.signOut();
    goto('/login');
  }
</script>

<div class="min-h-screen bg-zinc-950">
  {@render children()}
</div>
