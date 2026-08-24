<script lang="ts">
    import { X } from "@lucide/svelte";
    import { Dialog } from "bits-ui";
    import type { Snippet } from "svelte";

    let {
        open = $bindable(false),
        children,
        title,
        description,
        class: className,
        closeOnOutsideClick = true,
    }: {
        open?: boolean;
        children?: Snippet;
        title?: string;
        description?: string;
        class?: string;
        closeOnOutsideClick?: boolean;
    } = $props();
</script>

<Dialog.Root bind:open>
    <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
            interactOutsideBehavior={closeOnOutsideClick ? "close" : "ignore"}
            class="fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-6 text-foreground shadow-2xl focus:outline-none {className ||
                'max-w-lg'}"
        >
            <div class="flex flex-col space-y-1.5 pr-8 text-left">
                {#if title}
                    <Dialog.Title class="text-xl font-semibold leading-none tracking-tight">{title}</Dialog.Title>
                {/if}
                {#if description}
                    <Dialog.Description class="text-sm leading-relaxed text-muted-foreground">
                        {description}
                    </Dialog.Description>
                {/if}
            </div>

            {#if children}
                {@render children()}
            {/if}

            <Dialog.Close
                class="absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <X class="h-4 w-4" />
                <span class="sr-only">Close</span>
            </Dialog.Close>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>
