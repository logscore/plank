<script lang="ts">
  import { cn } from "$lib/utils";
  import { X } from "lucide-svelte";
  
  let { open = $bindable(false), children, title, description } = $props();

  function close() {
    open = false;
  }
</script>

{#if open}
  <div class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onclick={close} role="presentation">
    <div 
        class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg"
        onclick={(e) => e.stopPropagation()}
        role="dialog"
    >
      <div class="flex flex-col space-y-1.5 text-center sm:text-left">
        {#if title}
            <h2 class="text-lg font-semibold leading-none tracking-tight">{title}</h2>
        {/if}
        {#if description}
            <p class="text-sm text-muted-foreground">{description}</p>
        {/if}
      </div>
      
      {@render children()}

      <button
        class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
        onclick={close}
      >
        <X class="h-4 w-4" />
        <span class="sr-only">Close</span>
      </button>
    </div>
  </div>
{/if}
