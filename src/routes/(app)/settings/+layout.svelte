<script lang="ts">
    import { Check, ChevronDown } from "@lucide/svelte";
    import { Dialog } from "bits-ui";
    import { page } from "$app/state";
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

<div class="mx-auto min-h-screen max-w-6xl px-4 pt-8 pb-28 sm:pt-12">
    <header class="mb-9">
        <h1 class="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Settings</h1>
        <p class="mt-2 truncate text-sm text-muted-foreground">
            {data.user.email} · {data.organization.name} <span class="capitalize">({data.userRole})</span>
        </p>
    </header>

    <div class="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        <aside class="hidden lg:block">
            <nav class="sticky top-10 space-y-5 rounded-2xl border border-white/10 bg-card/50 p-4">
                {#each groups as { group, items } (group)}
                    <div>
                        <p class="px-3 text-xs font-medium text-muted-foreground">{group}</p>
                        <ul class="mt-2 space-y-1">
                            {#each items as section (section.href)}
                                {@const isActive = activeHref === section.href}
                                <li><a
                                    href={section.href}
                                    aria-current={isActive ? "page" : undefined}
                                    class="block rounded-lg px-3 py-2 text-sm transition-colors {isActive
                                            ? 'bg-white/10 font-medium text-white'
                                            : 'text-zinc-400 hover:bg-white/5 hover:text-white'}"
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
            <div class="mb-6 lg:hidden">
                <button
                    type="button"
                    onclick={() => (sheetOpen = true)}
                    class="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <span class="text-sm font-medium">{activeSection?.label ?? "Settings"}</span>
                    <ChevronDown class="size-4 text-muted-foreground" />
                </button>
            </div>

            <div class="mb-6 hidden lg:block">
                <h2 class="text-xl font-semibold text-white">{activeSection?.label ?? "Settings"}</h2>
            </div>

            {@render children()}
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
                <p class="px-3 pt-4 pb-2 text-xs font-medium text-muted-foreground">{group}</p>
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
