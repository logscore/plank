<script lang="ts">
    import { ArrowLeft, RefreshCw, TriangleAlert } from '@lucide/svelte';
    import { page } from '$app/state';
    import Button from '$lib/components/ui/Button.svelte';

    function refreshPage() {
        if (typeof window !== 'undefined') {
            window.location.reload();
        }
    }
</script>

<svelte:head>
    <title>Error {page.status} | Plank</title>
</svelte:head>

<div class="min-h-screen bg-background flex items-center justify-center p-4">
    <div class="w-full max-w-lg space-y-8">
        <!-- Error Icon & Status -->
        <div class="text-center space-y-4">
            <div
                class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10 border border-destructive/20"
            >
                <TriangleAlert class="w-10 h-10 text-destructive" />
            </div>
            <div>
                <h1 class="text-6xl font-bold text-foreground">{page.status}</h1>
                <p class="text-xl text-muted-foreground mt-2">
                    {#if page.status === 404}
                        Page Not Found
                    {:else if page.status === 500}
                        Internal Server Error
                    {:else if page.status === 403}
                        Access Denied
                    {:else}
                        Something Went Wrong
                    {/if}
                </p>
            </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onclick={() => window.history.back()} variant="outline" class="gap-2">
                <ArrowLeft class="w-4 h-4" />
                Go Back
            </Button>
            <Button onclick={refreshPage} variant="secondary" class="gap-2">
                <RefreshCw class="w-4 h-4" />
                Refresh Page
            </Button>
        </div>
    </div>
</div>
