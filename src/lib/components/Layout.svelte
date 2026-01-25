<script lang="ts">
    import { Film, LogOut, Play, Plus, Search, User, UserPlus } from '@lucide/svelte';
    import type { Snippet } from 'svelte';
    import { fade, fly } from 'svelte/transition';
    import { page } from '$app/state';
    import { uiState } from '$lib/ui-state.svelte';
    import { cn } from '$lib/utils';

    let {
        children,
        logout,
    }: {
        children: Snippet;
        logout: () => void;
    } = $props();

    let showAccountMenu = $state(false);

    const navItems = [
        { href: '/', icon: Film, label: 'Library' },
        { href: '/browse', icon: Play, label: 'Browse' },
        { href: '/search', icon: Search, label: 'Search' },
    ];

    function handleClickOutside(e: MouseEvent) {
        if (showAccountMenu && !(e.target as HTMLElement).closest('.account-menu')) {
            showAccountMenu = false;
        }
    }
</script>

<svelte:document onclick={handleClickOutside} />

<div
    class={cn("min-h-screen bg-background text-foreground flex flex-col relative", !page.url.pathname.startsWith("/watch") && "pb-24")}
>
    <!-- Account Button - Bottom Right Corner -->
    {#if !page.url.pathname.startsWith("/watch")}
        <div class="fixed bottom-8 right-8 z-50 account-menu" transition:fly={{ y: 20, duration: 300 }}>
            <div class="p-1.5 rounded-full border border-white/10 bg-black/80 backdrop-blur-xl shadow-2xl">
                <button
                    onclick={() => (showAccountMenu = !showAccountMenu)}
                    class="flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
                    aria-label="Account"
                >
                    <User class="w-6 h-6" />
                </button>
            </div>

            <!-- Context Menu -->
            {#if showAccountMenu}
                <div
                    class="absolute bottom-full right-0 mb-4 w-40 rounded-md shadow-lg bg-black/95 border border-white/10 ring-1 ring-black ring-opacity-5 backdrop-blur-md overflow-hidden z-50"
                    transition:fly={{ y: 10, duration: 150 }}
                >
                    <div class="py-1" role="menu">
                        <a
                            href="/account"
                            class="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-white/10 flex items-center gap-3"
                            role="menuitem"
                            onclick={() => (showAccountMenu = false)}
                        >
                            <User class="w-4 h-4" />
                            View Account
                        </a>
                        <button
                            onclick={() => {
                                showAccountMenu = false;
                                logout();
                            }}
                            class="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-white/10 flex items-center gap-3"
                            role="menuitem"
                        >
                            <LogOut class="w-4 h-4" />
                            Sign Out
                        </button>
                    </div>
                </div>
            {/if}
        </div>
    {/if}

    <!-- Main Content -->
    <main class="flex-1 relative">
        <div
            class="absolute inset-0 bg-linear from-background via-background/95 to-background pointer-events-none -z-10"
        ></div>
        {@render children()}
    </main>

    <!-- Bottom Floating Pill Navigation (Hidden on Player) -->
    {#if !page.url.pathname.startsWith("/watch")}
        <div class="fixed bottom-8 left-1/2 -translate-x-1/2 z-50" transition:fly={{ y: 20, duration: 300 }}>
            <nav
                class="flex items-center gap-1 p-1.5 rounded-full border border-white/10 bg-black/80 backdrop-blur-xl shadow-2xl"
            >
                <!-- Browse & Search -->
                {#each navItems as item}
                    {@const isActive = page.url.pathname === item.href}
                    <div class="group relative">
                        <a
                            href={item.href}
                            class={cn(
                                "flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 relative hover:bg-white/10",
                                isActive
                                    ? "text-white bg-white/10"
                                    : "text-zinc-400 hover:text-white",
                            )}
                            aria-label={item.label}
                        >
                            <item.icon class="w-5 h-5 relative z-10" />
                            {#if isActive}
                                <div class="absolute bottom-2 w-1 h-1 bg-primary rounded-full" transition:fade></div>
                            {/if}
                        </a>

                        <!-- Tooltip -->
                        <div
                            class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 border border-white/10 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap"
                        >
                            {item.label}
                        </div>
                    </div>
                {/each}

                <!-- Divider -->
                <div class="w-px h-8 bg-white/10 mx-1"></div>

                <!-- Add Media -->
                <div class="group relative">
                    <button
                        onclick={() => uiState.toggleAddMediaDialog()}
                        class="flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
                        aria-label="Add Media"
                    >
                        <Plus class="w-6 h-6" />
                    </button>
                    <!-- Tooltip -->
                    <div
                        class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 border border-white/10 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap"
                    >
                        Add Media
                    </div>
                </div>
            </nav>
        </div>
    {/if}
</div>
