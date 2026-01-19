<script lang="ts">
  import { authClient } from '$lib/auth-client';
  import { goto } from '$app/navigation';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import { Tv } from 'lucide-svelte';

  let name = $state('');
  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let loading = $state(false);
  let error = $state('');

  async function handleSubmit(e: Event) {
    e.preventDefault();
    loading = true;
    error = '';

    if (password !== confirmPassword) {
      error = 'Passwords do not match';
      loading = false;
      return;
    }

    if (password.length < 8) {
      error = 'Password must be at least 8 characters';
      loading = false;
      return;
    }

    try {
      const result = await authClient.signUp.email({
        email,
        password,
        name,
      });

      if (result.error) {
        error = result.error.message || 'Registration failed';
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

<div class="w-full max-w-md bg-card/50 backdrop-blur-xl rounded-xl p-8 border border-white/10 shadow-2xl">
  <div class="text-center mb-8 flex flex-col items-center">
    <h1 class="text-3xl font-bold tracking-tight">Create an account</h1>
    <p class="text-muted-foreground mt-2">Enter your details below</p>
  </div>

  <form onsubmit={handleSubmit} class="space-y-4">
    {#if error}
      <div class="p-3 bg-destructive/15 border border-destructive/50 rounded-lg text-white/90 text-sm text-center">
        {error}
      </div>
    {/if}

    <div class="space-y-4">
        <div class="space-y-2">
            <label for="name" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Name</label>
            <Input
              type="text"
              id="name"
              bind:value={name}
              required
              placeholder="John Doe"
              class="bg-background/50"
            />
        </div>

        <div class="space-y-2">
            <label for="email" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Email</label>
            <Input
              type="email"
              id="email"
              bind:value={email}
              required
              placeholder="name@example.com"
              class="bg-background/50"
            />
        </div>

        <div class="space-y-2">
            <label for="password" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Password</label>
            <Input
              type="password"
              id="password"
              bind:value={password}
              required
              minlength={8}
              placeholder="••••••••"
              class="bg-background/50"
            />
        </div>

        <div class="space-y-2">
            <label for="confirmPassword" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Confirm Password</label>
            <Input
              type="password"
              id="confirmPassword"
              bind:value={confirmPassword}
              required
              placeholder="••••••••"
              class="bg-background/50"
            />
        </div>
    </div>

    <Button type="submit" disabled={loading} class="w-full" size="lg">
      {loading ? 'Creating account...' : 'Create Account'}
    </Button>
  </form>

  <p class="mt-6 text-center text-muted-foreground text-sm">
    Already have an account?
    <a href="/login" class="text-primary hover:text-primary/80 transition font-medium hover:underline underline-offset-4">Sign in</a>
  </p>
</div>
