<script lang="ts">
  import { authClient } from '$lib/auth-client';
  import { goto } from '$app/navigation';

  let email = $state('');
  let password = $state('');
  let loading = $state(false);
  let error = $state('');

  async function handleSubmit(e: Event) {
    e.preventDefault();
    loading = true;
    error = '';

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        error = result.error.message || 'Invalid credentials';
      } else {
        goto('/');
      }
    } catch (e) {
      error = 'An error occurred. Please try again.';
    } finally {
      loading = false;
    }
  }
</script>

<div class="bg-zinc-900 rounded-xl p-8 shadow-2xl border border-zinc-800">
  <div class="text-center mb-8">
    <h1 class="text-3xl font-bold text-red-500">Plank</h1>
    <p class="text-zinc-400 mt-2">Sign in to your account</p>
  </div>

  <form onsubmit={handleSubmit} class="space-y-4">
    {#if error}
      <div class="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
        {error}
      </div>
    {/if}

    <div>
      <label for="email" class="block text-sm font-medium text-zinc-300 mb-1">Email</label>
      <input
        type="email"
        id="email"
        bind:value={email}
        required
        class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 transition"
        placeholder="you@example.com"
      />
    </div>

    <div>
      <label for="password" class="block text-sm font-medium text-zinc-300 mb-1">Password</label>
      <input
        type="password"
        id="password"
        bind:value={password}
        required
        class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 transition"
        placeholder="••••••••"
      />
    </div>

    <button
      type="submit"
      disabled={loading}
      class="w-full py-3 bg-red-600 hover:bg-red-700 rounded-lg font-medium text-white disabled:opacity-50 transition"
    >
      {loading ? 'Signing in...' : 'Sign In'}
    </button>
  </form>

  <p class="mt-6 text-center text-zinc-400 text-sm">
    Don't have an account?
    <a href="/register" class="text-red-400 hover:text-red-300 transition">Create one</a>
  </p>
</div>
