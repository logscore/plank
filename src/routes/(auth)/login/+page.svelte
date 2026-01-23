<script lang="ts">
    import { Tv } from 'lucide-svelte';
    import { goto } from '$app/navigation';
    import { authClient } from '$lib/auth-client';
    import Button from '$lib/components/ui/Button.svelte';
    import Input from '$lib/components/ui/Input.svelte';

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

<div class="w-full max-w-md bg-card/50 backdrop-blur-xl rounded-xl p-8 border border-white/10 shadow-2xl">
    <div class="text-center mb-8 flex flex-col items-center">
        <h1 class="text-3xl font-bold tracking-tight">Welcome back</h1>
        <p class="text-muted-foreground mt-2">Sign in to your account</p>
    </div>

    <form onsubmit={handleSubmit} class="space-y-4">
        {#if error}
            <div
                class="p-3 bg-destructive/15 border border-destructive/50 rounded-lg text-destructive text-sm text-center"
            >
                {error}
            </div>
        {/if}

        <div class="space-y-4">
            <div class="space-y-2">
                <label
                    for="email"
                    class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                    Email
                </label>
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
                <label
                    for="password"
                    class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                    Password
                </label>
                <Input
                    type="password"
                    id="password"
                    bind:value={password}
                    required
                    placeholder="••••••••"
                    class="bg-background/50"
                />
            </div>
        </div>

        <Button type="submit" disabled={loading} class="w-full" size="lg">
            {loading ? 'Signing in...' : 'Sign In'}
        </Button>
    </form>

    <p class="mt-6 text-center text-muted-foreground text-sm">
        Don't have an account?
        <a
            href="/register"
            class="text-primary hover:text-primary/80 transition font-medium hover:underline underline-offset-4"
            >Create account</a
        >
    </p>
</div>
