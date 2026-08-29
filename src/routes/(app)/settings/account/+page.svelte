<script lang="ts">
    import { untrack } from "svelte";
    import { toast } from "svelte-sonner";
    import { invalidateAll } from "$app/navigation";
    import { authClient } from "$lib/auth-client";
    import Input from "$lib/components/ui/Input.svelte";
    import { createUploadAvatarMutation } from "$lib/data/profile";
    import AvatarField from "../AvatarField.svelte";
    import SaveBar from "../SaveBar.svelte";
    import Section from "../Section.svelte";
    import type { PageData } from "./$types";

    let { data } = $props<{ data: PageData }>();
    const uploadAvatarMutation = createUploadAvatarMutation();

    let name = $state(untrack(() => data.user.name || ""));
    let pendingPhoto = $state<File | null>(null);
    let saving = $state(false);

    const savedName = $derived(data.user.name || "");
    const trimmedName = $derived(name.trim());
    const canSave = $derived(trimmedName.length > 0 && (pendingPhoto !== null || trimmedName !== savedName));

    function reset() {
        name = savedName;
        pendingPhoto = null;
    }

    async function save() {
        if (!canSave || saving) {
            return;
        }

        saving = true;
        try {
            if (pendingPhoto) {
                await uploadAvatarMutation.mutateAsync(pendingPhoto);
            }
            if (trimmedName !== savedName) {
                await authClient.updateUser({ name: trimmedName });
            }
            pendingPhoto = null;
            toast.success("Account updated");
            await invalidateAll();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update account");
        } finally {
            saving = false;
        }
    }
</script>

<div class="divide-y divide-white/10">
    <Section title="Photo" description="Shown on your profile picker and in the account menu.">
        <AvatarField
            bind:file={pendingPhoto}
            currentUrl={data.user.image}
            name={name || "User"}
            changeLabel="photo"
            disabled={saving}
        />
    </Section>

    <Section title="Details">
        <div class="max-w-sm space-y-6">
            <div>
                <label for="displayName" class="mb-2 block text-sm font-medium">Display name</label>
                <Input id="displayName" type="text" bind:value={name} placeholder="Your name" />
            </div>

            <div>
                <div class="mb-2 flex items-baseline justify-between gap-4">
                    <span class="text-sm font-medium">Email</span>
                    <span class="text-xs text-muted-foreground">Read only</span>
                </div>
                <p class="rounded-md border border-white/8 px-3 py-2 text-sm text-muted-foreground">
                    {data.user.email}
                </p>
            </div>
        </div>
    </Section>
</div>

<SaveBar dirty={canSave} {saving} onsave={save} onreset={reset} />
