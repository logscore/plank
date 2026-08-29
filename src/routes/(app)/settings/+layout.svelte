<script lang="ts">
    import { Check, ChevronDown } from "@lucide/svelte";
    import { Dialog } from "bits-ui";
    import { page } from "$app/state";
    import Facehash from "$lib/components/facehash/Facehash.svelte";
    import type { LayoutData } from "./$types";
    import { findSection, visibleSections } from "./sections";

    let { data, children } = $props<{ data: LayoutData; children: () => unknown }>();

    let sheetOpen = $state(false);

    const sections = $derived(visibleSections(data.userRole));
    const activeHref = $derived(page.url.pathname);
    const activeSection = $derived(findSection(activeHref));
    const groups = $derived.by(() => {
        const order: string[] = [];
        const byGroup = new Map<string, typeof sections>();
        for (const section of sections) {
            const bucket = byGroup.get(section.group);
            if (bucket) {
                bucket.push(section);
                continue;
            }
            order.push(section.group);
            byGroup.set(section.group, [section]);
        }
        return order.map((group) => ({ group, items: byGroup.get(group) ?? [] }));
    });
</script>

<div class="relative min-h-screen">
    <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-105 bg-[radial-gradient(70%_100%_at_50%_0%,hsl(var(--primary)/0.16),transparent_70%)]"
    ></div>

    <div class="mx-auto max-w-6xl px-4 pt-12 pb-28 sm:px-6 lg:px-8">
        <header class="pb-10">
            <p class="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">Settings</p>

            <div class="mt-6 flex flex-wrap items-center gap-x-5 gap-y-4">
                {#if data.user.image}
                    <img
                        src={data.user.image}
                        alt={data.user.name || "User"}
                        class="size-16 shrink-0 rounded-full object-cover"
                    >
                {:else}
                    <Facehash
                        class="shrink-0 rounded-full"
                        name={data.user.name || ""}
                        variant="gradient"
                        size={64}
                        intensity3d="medium"
                    />
                {/if}

                <div class="min-w-0">
                    <h1 class="truncate text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                        {data.user.name || "User"}
                    </h1>
                    <p class="mt-1 truncate text-sm text-muted-foreground">{data.user.email}</p>
                </div>

                <div class="ml-auto flex items-center gap-3 rounded-full border border-white/10 px-4 py-2">
                    {#if data.organization.logo}
                        <img
                            src={data.organization.logo}
                            alt={data.organization.name}
                            class="size-7 rounded-full object-cover"
                        >
                    {:else}
                        <Facehash class="rounded-full" name={data.organization.name} size={28} intensity3d="medium" />
                    {/if}
                    <div class="text-sm leading-tight">
                        <p class="font-medium">{data.organization.name}</p>
                        <p class="capitalize text-muted-foreground">{data.userRole}</p>
                    </div>
                </div>
            </div>
        </header>

        <div class="border-t border-white/10 pt-8 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-14">
            <aside class="hidden lg:block">
                <nav class="sticky top-10 space-y-7">
                    {#each groups as { group, items } (group)}
                        <div>
                            <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
                                {group}
                            </p>
                            <ul class="mt-3 space-y-px">
                                {#each items as section (section.href)}
                                    {@const isActive = activeHref === section.href}
                                    <li><a
                                        href={section.href}
                                        aria-current={isActive ? "page" : undefined}
                                        class="-ml-px block border-l py-1.5 pl-4 text-sm transition-colors {isActive
                                                ? 'border-primary font-medium text-foreground'
                                                : 'border-white/10 text-muted-foreground hover:border-white/30 hover:text-foreground'}"
                                    >
                                        {section.label}
                                    </a></li>
                                {/each}
                            </ul>
                        </div>
                    {/each}
                </nav>
            </aside>

            <div class="min-w-0 max-w-190">
                <div class="lg:hidden">
                    <button
                        type="button"
                        onclick={() => (sheetOpen = true)}
                        class="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <span class="text-sm font-medium">{activeSection?.label ?? "Settings"}</span>
                        <ChevronDown class="size-4 text-muted-foreground" />
                    </button>
                </div>

                <div class="hidden lg:block">
                    <h2 class="text-2xl font-semibold tracking-tight">{activeSection?.label ?? "Settings"}</h2>
                </div>

                {@render children()}
            </div>
        </div>
    </div>
</div>

<Dialog.Root bind:open={sheetOpen}>
    <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
            class="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-zinc-950 px-4 pt-3 pb-8 shadow-2xl focus:outline-none"
        >
            <div class="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20"></div>
            <Dialog.Title class="sr-only">Settings sections</Dialog.Title>
            {#each groups as { group, items } (group)}
                <p class="px-3 pt-4 pb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
                    {group}
                </p>
                {#each items as section (section.href)}
                    {@const isActive = activeHref === section.href}
                    <a
                        href={section.href}
                        onclick={() => (sheetOpen = false)}
                        class="flex h-12 items-center justify-between rounded-xl px-3 text-sm transition-colors hover:bg-white/5 {isActive
                            ? 'text-foreground'
                            : 'text-muted-foreground'}"
                    >
                        <span class="font-medium">{section.label}</span>
                        {#if isActive}
                            <Check class="size-4 text-primary" />
                        {/if}
                    </a>
                {/each}
            {/each}
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>
