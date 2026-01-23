<div
    class="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-background"
>
    <!-- Background Gradients -->
    <div class="absolute inset-0 bg-zinc-950"></div>
    <div class="absolute top-0 -left-4 w-96 h-96 bg-primary/20 rounded-full blur-[128px]"></div>
    <div
        class="absolute bottom-0 -right-4 w-96 h-96 bg-blue-500/10 rounded-full blur-[128px]"
    ></div>

    <div class="relative z-10 w-full max-w-md">{@render children()}</div>
</div>

<script lang="ts">
    let { children } = $props();
</script>
