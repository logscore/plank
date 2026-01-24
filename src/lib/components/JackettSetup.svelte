<script lang="ts">
    import { Check, Play, Plus } from 'lucide-svelte';

    interface Props {
        jackettUrl: string;
        hasApiKey: boolean;
    }

    let { jackettUrl, hasApiKey }: Props = $props();
</script>

<div class="max-w-2xl mx-auto p-6 bg-card rounded-lg border border-border">
    <div class="text-center mb-6">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
            <Plus class="w-6 h-6 text-primary" />
        </div>
        <h2 class="text-xl font-semibold mb-2">Configure Jackett for Torrent Sources</h2>
        <p class="text-muted-foreground">
            Jackett provides access to multiple torrent trackers. Follow these steps to get started.
        </p>
    </div>

    <div class="space-y-4">
        <!-- Step 1 -->
        <div class="flex gap-3">
            <div
                class="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium"
            >
                1
            </div>
            <div class="flex-1">
                <h3 class="font-medium mb-1">Install Jackett</h3>
                <p class="text-sm text-muted-foreground mb-2">
                    Download and install Jackett on your system or run it via Docker.
                </p>
                <a
                    href="https://github.com/Jackett/Jackett/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                    <Plus class="w-3 h-3" />
                    Download Jackett
                </a>
            </div>
        </div>

        <!-- Step 2 -->
        <div class="flex gap-3">
            <div
                class="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium"
            >
                2
            </div>
            <div class="flex-1">
                <h3 class="font-medium mb-1">Add Torrent Indexers</h3>
                <p class="text-sm text-muted-foreground mb-2">
                    Open Jackett web interface and add your preferred torrent trackers. Public indexers like:
                </p>
                <div class="text-sm space-y-1 mb-2">
                    <div class="flex items-center gap-2">
                        <Check class="w-3 h-3 text-green-500" />
                        <span>YTS (YIFY) - Movies only</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <Check class="w-3 h-3 text-green-500" />
                        <span>1337x - Movies & TV shows</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <Check class="w-3 h-3 text-green-500" />
                        <span>The Pirate Bay - Large content library</span>
                    </div>
                </div>
                <a
                    href={jackettUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                    <Plus class="w-3 h-3" />
                    Open Jackett Dashboard
                </a>
            </div>
        </div>

        <!-- Step 3 -->
        <div class="flex gap-3">
            <div
                class="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium"
            >
                3
            </div>
            <div class="flex-1">
                <h3 class="font-medium mb-1">Get API Key</h3>
                <p class="text-sm text-muted-foreground mb-2">
                    Find your API key in Jackett dashboard. Click the copy button next to the API key.
                </p>
                {#if !hasApiKey}
                    <div class="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                        <strong>Missing API Key:</strong> Add JACKETT_API_KEY to your environment variables.
                    </div>
                {:else}
                    <div
                        class="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-800 flex items-center gap-1"
                    >
                        <Check class="w-3 h-3" />
                        <span>API key is configured</span>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Step 4 -->
        <div class="flex gap-3">
            <div
                class="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium"
            >
                4
            </div>
            <div class="flex-1">
                <h3 class="font-medium mb-1">Restart Application</h3>
                <p class="text-sm text-muted-foreground">
                    After configuring the environment variables, restart the application to apply changes.
                </p>
            </div>
        </div>
    </div>

    <!-- Quick Docker Example -->
    <div class="mt-6 p-4 bg-muted rounded-lg">
        <h4 class="font-medium text-sm mb-2 flex items-center gap-2">
            <Play class="w-4 h-4" />
            Quick Docker Setup
        </h4>
        <div class="text-xs space-y-2 font-mono">
            <div class="text-muted-foreground"># Run Jackett with persistent config</div>
            <div>docker run -d \</div>
            <div class="pl-4">--name jackett \</div>
            <div class="pl-4">--restart unless-stopped \</div>
            <div class="pl-4">-v /path/to/jackett/config:/config \</div>
            <div class="pl-4">-p 9117:9117 \</div>
            <div class="pl-4">linuxserver/jackett</div>
        </div>
    </div>
</div>
