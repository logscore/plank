<script lang="ts">
    import { ArrowLeft, Github, RefreshCw, TriangleAlert } from "@lucide/svelte";
    import { page } from "$app/state";
    import Button from "$lib/components/ui/Button.svelte";
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

        <!-- Error Message -->
        <div class="p-4 bg-card border border-border rounded-lg text-center">
            <p class="text-muted-foreground">
                {page.error?.message ||
                    "An unexpected error occurred. Please try again."}
            </p>
        </div>

        <!-- Action Buttons -->
        <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
                onclick={() => {
                    if (typeof window !== "undefined") {
                        window.history.back();
                    }
                }}
                variant="outline"
                class="gap-2"
            >
                <ArrowLeft class="w-4 h-4" />
                Go Back
            </Button>
            <Button
                onclick={() => {
                    if (typeof window !== "undefined") {
                        window.location.reload();
                    }
                }}
                variant="secondary"
                class="gap-2"
            >
                <RefreshCw class="w-4 h-4" />
                Refresh Page
            </Button>
        </div>
        <!-- Report Bug Section -->
        <div class="p-4 bg-accent/30 border border-border rounded-lg space-y-3">
            <p class="text-sm text-center text-muted-foreground">
                Think this is a bug? Send the error details above to the developer.
            </p>
            <div class="flex flex-col sm:flex-row gap-2 justify-center">
                <a
                    href="https://github.com/logscore/plank/issues/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium bg-[#24292e] text-white hover:bg-[#2f363d] transition-colors"
                >
                    <Github class="w-4 h-4" />
                    Report on GitHub
                </a>
                <a
                    href="https://x.com/logscore"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
                >
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path
                            d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                        />
                    </svg>
                    Message on X
                </a>
            </div>
        </div>
    </div>
</div>
