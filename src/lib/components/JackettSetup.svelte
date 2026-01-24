<script lang="ts">
    import { Check, Copy, ExternalLink, Plus, Terminal } from '@lucide/svelte';

    interface Props {
        jackettUrl: string;
        hasApiKey: boolean;
    }

    let { jackettUrl, hasApiKey }: Props = $props();

    let copied = $state(false);

    function copyDockerCommand() {
        const command = `docker run -d \\
  --name jackett \\
  --restart unless-stopped \\
  -v /path/to/jackett/config:/config \\
  -p 9117:9117 \\
  linuxserver/jackett`;
        navigator.clipboard.writeText(command);
        copied = true;
        setTimeout(() => {
            copied = false;
        }, 2000);
    }
</script>

<div class="max-w-3xl mx-auto">
    <div
        class="relative overflow-hidden p-8 bg-card/50 backdrop-blur-xl rounded-2xl border border-border/50 shadow-2xl transition-all duration-500 hover:shadow-primary/5 hover:border-primary/20"
    >
        <!-- Background Decorator -->
        <div
            class="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"
        ></div>

        <div class="relative z-10 text-center mb-10">
            <div
                class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-linear-to-br from-primary/20 to-primary/5 mb-6 shadow-inner ring-1 ring-white/10"
            >
                <Plus class="w-8 h-8 text-primary animate-pulse" />
            </div>
            <h2 class="text-3xl font-bold mb-3 tracking-tight">Configure Jackett</h2>
            <p class="text-muted-foreground max-w-md mx-auto text-balance leading-relaxed">
                Connect your torrent indexers to expand your library. Follow these simple steps to get started.
            </p>
        </div>

        <div class="space-y-6 relative">
            <!-- Step 1 -->
            <div
                class="group flex gap-5 p-4 rounded-xl transition-all duration-300 hover:bg-accent/30 border border-transparent hover:border-border/50"
            >
                <div
                    class="shrink-0 w-10 h-10 rounded-full bg-background border-2 border-primary/20 text-primary flex items-center justify-center font-bold shadow-sm z-10 group-hover:scale-105 group-hover:border-primary transition-all duration-300"
                >
                    1
                </div>
                <div class="flex-1 pt-1">
                    <h3 class="font-semibold text-lg mb-1 group-hover:text-primary transition-colors">
                        Install Jackett
                    </h3>
                    <p class="text-sm text-muted-foreground mb-4 leading-relaxed">
                        Download and install Jackett on your system or run it via Docker to manage your indexers.
                    </p>
                    <a
                        href="https://github.com/Jackett/Jackett/releases"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-transform hover:scale-105 active:scale-95 shadow-lg shadow-primary/20"
                    >
                        <Plus class="w-4 h-4" />
                        Download Jackett
                    </a>
                </div>
            </div>

            <!-- Step 2 -->
            <div
                class="group flex gap-5 p-4 rounded-xl transition-all duration-300 hover:bg-accent/30 border border-transparent hover:border-border/50"
            >
                <div
                    class="shrink-0 w-10 h-10 rounded-full bg-background border-2 border-primary/20 text-primary flex items-center justify-center font-bold shadow-sm z-10 group-hover:scale-105 group-hover:border-primary transition-all duration-300"
                >
                    2
                </div>
                <div class="flex-1 pt-1">
                    <h3 class="font-semibold text-lg mb-1 group-hover:text-primary transition-colors">
                        Add Torrent Indexers
                    </h3>
                    <p class="text-sm text-muted-foreground mb-3 leading-relaxed">
                        Open the Jackett interface and add your trackers. We recommend these public indexers:
                    </p>
                    <div class="space-y-2 mb-4">
                        {#each ["YTS (YIFY)", "1337x", "The Pirate Bay"] as idx}
                            <div
                                class="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground transition-colors"
                            >
                                <div class="w-5 h-5 rounded-full bg-green-500/10 flex items-center justify-center">
                                    <Check class="w-3 h-3 text-green-500" />
                                </div>
                                {idx}
                            </div>
                        {/each}
                    </div>
                    <a
                        href={jackettUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors group/link"
                    >
                        Open Dashboard
                        <ExternalLink class="w-3 h-3" />
                    </a>
                </div>
            </div>

            <!-- Step 3 -->
            <div
                class="group flex gap-5 p-4 rounded-xl transition-all duration-300 hover:bg-accent/30 border border-transparent hover:border-border/50"
            >
                <div
                    class="shrink-0 w-10 h-10 rounded-full bg-background border-2 border-primary/20 text-primary flex items-center justify-center font-bold shadow-sm z-10 group-hover:scale-105 group-hover:border-primary transition-all duration-300"
                >
                    3
                </div>
                <div class="flex-1 pt-1">
                    <h3 class="font-semibold text-lg mb-1 group-hover:text-primary transition-colors">
                        Configure API Key
                    </h3>
                    <p class="text-sm text-muted-foreground mb-3 leading-relaxed">
                        Copy the API key from your Jackett dashboard and add it to your environment variables.
                    </p>

                    <div
                        class="relative overflow-hidden rounded-lg border transition-all duration-300 {hasApiKey
                            ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400'
                            : 'bg-orange-500/10 border-orange-500/20 text-orange-700 dark:text-orange-400'}"
                    >
                        <div class="flex items-center gap-3 p-3">
                            <div
                                class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 {hasApiKey
                                    ? 'bg-green-500/20'
                                    : 'bg-orange-500/20'}"
                            >
                                {#if hasApiKey}
                                    <Check class="w-4 h-4" />
                                {:else}
                                    <div class="w-2 h-2 rounded-full bg-current animate-ping"></div>
                                {/if}
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-semibold">
                                    {hasApiKey
                                        ? "API Key Configured"
                                        : "Missing API Key"}
                                </p>
                                <p class="text-xs opacity-80 truncate">
                                    {hasApiKey
                                        ? "Your setup is ready to go!"
                                        : "Set JACKETT_API_KEY env variable"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Step 4 -->
            <div
                class="group flex gap-5 p-4 rounded-xl transition-all duration-300 hover:bg-accent/30 border border-transparent hover:border-border/50"
            >
                <div
                    class="shrink-0 w-10 h-10 rounded-full bg-background border-2 border-primary/20 text-primary flex items-center justify-center font-bold shadow-sm z-10 group-hover:scale-105 group-hover:border-primary transition-all duration-300"
                >
                    4
                </div>
                <div class="flex-1 pt-1">
                    <h3 class="font-semibold text-lg mb-1 group-hover:text-primary transition-colors">Restart</h3>
                    <p class="text-sm text-muted-foreground mb-3 leading-relaxed">
                        Restart the application to apply changes.
                    </p>
                </div>
            </div>
        </div>

        <!-- Quick Docker Example -->
        <div class="mt-8 border-t border-border/50 pt-8">
            <h4
                class="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase"
            >
                <Terminal class="h-4 w-4" />
                Bare Metal Setup
            </h4>

            <div class="group relative overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                <div class="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-300 sm:text-sm">
                    <span class="text-slate-500"
                        ># If running on bare metal, you will need to start these services manually</span
                    >
                    <br>
                    <br>

                    <span class="text-blue-400">docker</span> run -d \<br>
                    &nbsp;&nbsp;<span class="text-violet-400">--name</span>
                    flaresolverr \<br>
                    &nbsp;&nbsp;<span class="text-violet-400">-p</span>
                    8191:8191 \<br>
                    &nbsp;&nbsp;<span class="text-violet-400">--restart</span>
                    unless-stopped \<br>
                    &nbsp;&nbsp;ghcr.io/flaresolverr/flaresolverr:latest
                    <br>
                    <br>

                    <span class="text-blue-400">docker</span> run -d \<br>
                    &nbsp;&nbsp;<span class="text-violet-400">--name</span>
                    jackett \<br>
                    &nbsp;&nbsp;<span class="text-violet-400">--restart</span>
                    unless-stopped \<br>
                    &nbsp;&nbsp;<span class="text-violet-400">-p</span>
                    9117:9117 \<br>
                    &nbsp;&nbsp;<span class="text-violet-400">-v</span>
                    /path/to/config:/config \<br>
                    &nbsp;&nbsp;linuxserver/jackett
                </div>

                <button
                    onclick={copyDockerCommand}
                    class="absolute right-3 top-3 rounded-md bg-slate-800/80 p-2 text-slate-400 opacity-0 transition-all hover:bg-slate-700 hover:text-white group-hover:opacity-100"
                    title="Copy command"
                >
                    {#if copied}
                        <Check class="h-4 w-4 text-green-400" />
                    {:else}
                        <Copy class="h-4 w-4" />
                    {/if}
                </button>
            </div>
        </div>
    </div>
</div>
