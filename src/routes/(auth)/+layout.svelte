<script>
  let { children } = $props();
</script>

<div class="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
  <div class="w-full max-w-md">
    {@render children()}
  </div>
</div>
