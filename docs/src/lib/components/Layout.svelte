<script lang="ts">
    import { Film, Play, Plus, Search, Settings, User, Users } from '@lucide/svelte';
    import type { Snippet } from 'svelte';
    import { fade, fly } from 'svelte/transition';
    import { toast } from 'svelte-sonner';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { demoStore } from '$lib/demo/store.svelte';
    import { cn } from '$lib/utils';
    import Facehash from './facehash/Facehash.svelte';

    let { children }: { children: Snippet } = $props();

    let showAccountMenu = $state(false);

    const navItems = [
        { href: '/', icon: Film, label: 'Library' },
        { href: '/browse', icon: Play, label: 'Browse' },
        { href: '/search', icon: Search, label: 'Search' },
    ];

    const hideNav = $derived(
        page.url.pathname.startsWith('/watch') ||
            page.url.pathname === '/profiles' ||
            page.url.pathname.startsWith('/profiles/')
    );

    function handleClickOutside(e: MouseEvent) {
        if (showAccountMenu && !(e.target as HTMLElement).closest('.account-menu')) {
            showAccountMenu = false;
        }
    }
</script>

<svelte:document onclick={handleClickOutside} />

<div class={cn('relative flex min-h-screen flex-col bg-background text-foreground', !hideNav && 'pb-24')}>
    {#if !hideNav}
        <div class="account-menu fixed right-8 bottom-8 z-50" transition:fly={{ y: 20, duration: 300 }}>
            <div class="rounded-full border border-white/10 bg-black/80 p-1.5 shadow-2xl backdrop-blur-xl">
                <button
                    onclick={() => (showAccountMenu = !showAccountMenu)}
                    class="flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300 hover:bg-white/10"
                    aria-label="Account"
                >
                    {#if demoStore.user.image}
                        <img
                            src={demoStore.user.image}
                            alt={demoStore.user.name}
                            class="h-12.5 w-12.5 rounded-full object-cover"
                        >
                    {:else}
                        <Facehash
                            class="rounded-full"
                            name={demoStore.user.name}
                            variant="solid"
                            size={50}
                            intensity3d="dramatic"
                        />
                    {/if}
                </button>
            </div>

            {#if showAccountMenu}
                <div
                    class="absolute right-0 bottom-full mb-4 w-48 overflow-hidden rounded-md border border-white/10 bg-black/95 shadow-lg ring-1 ring-black/5 backdrop-blur-md"
                    transition:fly={{ y: 10, duration: 150 }}
                >
                    <div class="py-1" role="menu">
                        <a
                            href="/profiles"
                            class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-200 hover:bg-white/10"
                            role="menuitem"
                            onclick={() => (showAccountMenu = false)}
                        >
                            <Users class="h-4 w-4" />
                            Switch Profile
                        </a>
                        <a
                            href="/account"
                            class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-200 hover:bg-white/10"
                            role="menuitem"
                            onclick={() => (showAccountMenu = false)}
                        >
                            <User class="h-4 w-4" />
                            View Account
                        </a>
                        <a
                            href="/settings"
                            class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-200 hover:bg-white/10"
                            role="menuitem"
                            onclick={() => (showAccountMenu = false)}
                        >
                            <Settings class="h-4 w-4" />
                            Settings
                        </a>
                    </div>
                </div>
            {/if}
        </div>
    {/if}

    <main class="relative flex-1">
        <div
            class="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-background via-background/95 to-background"
        ></div>
        {@render children()}
    </main>

    {#if !hideNav}
        <div class="fixed bottom-8 left-1/2 z-50 -translate-x-1/2" transition:fly={{ y: 20, duration: 300 }}>
            <nav
                class="flex items-center gap-1 rounded-full border border-white/10 bg-black/80 p-1.5 shadow-2xl backdrop-blur-xl"
            >
                {#each navItems as item}
                    {@const isActive = page.url.pathname === item.href}
                    <div class="group relative">
                        <a
                            href={item.href}
                            class={cn(
								'relative flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300 hover:bg-white/10',
								isActive ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'
							)}
                            aria-label={item.label}
                        >
                            <item.icon class="relative z-10 h-5 w-5" />
                            {#if isActive}
                                <div class="absolute bottom-2 h-1 w-1 rounded-full bg-primary" transition:fade></div>
                            {/if}
                        </a>
                        <div
                            class="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100"
                        >
                            {item.label}
                        </div>
                    </div>
                {/each}

                <div class="mx-1 h-8 w-px bg-white/10"></div>

                <div class="group relative">
                    <button
                        onclick={() => { toast.info('Add movies and shows from the Browse page'); goto('/browse'); }}
                        class="flex h-12 w-12 items-center justify-center rounded-full text-zinc-400 transition-all duration-300 hover:bg-white/10 hover:text-white"
                        aria-label="Add Media"
                    >
                        <Plus class="h-6 w-6" />
                    </button>
                    <div
                        class="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                        Add Media
                    </div>
                </div>
            </nav>
        </div>
    {/if}
</div>
