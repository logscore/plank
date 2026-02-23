<script lang="ts">
    import { ArrowLeft, Check, Copy, Github, RefreshCw, TriangleAlert } from '@lucide/svelte';
    import { page } from '$app/stores';
    import Button from '$lib/components/ui/Button.svelte';

    let copied = $state(false);

    const errorDetails = $derived(() => {
        const { status, error } = $page;
        const timestamp = new Date().toISOString();
        const url = typeof window !== 'undefined' ? window.location.href : '';
        const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

        return {
            status,
            message: error?.message || 'Unknown error',
            timestamp,
            url,
            userAgent,
        };
    });

    const errorLog = $derived(() => {
        const details = errorDetails();
        return `Error Report
================
Status: ${details.status}
Message: ${details.message}
URL: ${details.url}
Timestamp: ${details.timestamp}
User Agent: ${details.userAgent}`;
    });

    function copyErrorLog() {
        navigator.clipboard.writeText(errorLog());
        copied = true;
        setTimeout(() => {
            copied = false;
        }, 2000);
    }

    function refreshPage() {
        if (typeof window !== 'undefined') {
            window.location.reload();
        }
    }

    function goBack() {
        if (typeof window !== 'undefined') {
            window.history.back();
        }
    }
</script>

<svelte:head>
    <title>Error {$page.status} | Plank</title>
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
                <h1 class="text-6xl font-bold text-foreground">{$page.status}</h1>
                <p class="text-xl text-muted-foreground mt-2">
                    {#if $page.status === 404}
                        Page Not Found
                    {:else if $page.status === 500}
                        Internal Server Error
                    {:else if $page.status === 403}
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
                {$page.error?.message ||
                    "An unexpected error occurred. Please try again."}
            </p>
        </div>

        <!-- Action Buttons -->
        <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onclick={goBack} variant="outline" class="gap-2">
                <ArrowLeft class="w-4 h-4" />
                Go Back
            </Button>
            <Button onclick={refreshPage} variant="secondary" class="gap-2">
                <RefreshCw class="w-4 h-4" />
                Refresh Page
            </Button>
        </div>

        <!-- Error Console Log -->
        <!-- <div class="space-y-3">
            <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-muted-foreground">Error Details</span>
                <Button onclick={copyErrorLog} variant="ghost" size="sm" class="gap-2 h-8">
                    {#if copied}
                        <Check class="w-3.5 h-3.5 text-green-500" />
                        <span class="text-green-500">Copied!</span>
                    {:else}
                        <Copy class="w-3.5 h-3.5" />
                        <span>Copy</span>
                    {/if}
                </Button>
            </div>
            <div
                class="bg-secondary/50 border border-border rounded-lg p-4 font-mono text-xs text-muted-foreground overflow-x-auto"
            >
                <pre class="whitespace-pre-wrap break-all">{errorLog()}</pre>
            </div>
        </div> -->

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
