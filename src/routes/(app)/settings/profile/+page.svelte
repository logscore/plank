<script lang="ts">
    import { untrack } from "svelte";
    import { toast } from "svelte-sonner";
    import { invalidateAll } from "$app/navigation";
    import { authClient } from "$lib/auth-client";
    import Input from "$lib/components/ui/Input.svelte";
    import { createUploadOrganizationLogoMutation } from "$lib/data/profile";
    import { formatFileSize } from "$lib/utils";
    import AvatarField from "../AvatarField.svelte";
    import SaveBar from "../SaveBar.svelte";
    import Section from "../Section.svelte";
    import type { PageData } from "./$types";

    let { data } = $props<{ data: PageData }>();
    const uploadLogoMutation = createUploadOrganizationLogoMutation();

    let name = $state(untrack(() => data.organization.name));
    let pendingLogo = $state<File | null>(null);
    let saving = $state(false);

    const canEdit = $derived(data.userRole === "owner" || data.userRole === "admin");
    const savedName = $derived(data.organization.name);
    const trimmedName = $derived(name.trim());
    const canSave = $derived(canEdit && trimmedName.length > 0 && (pendingLogo !== null || trimmedName !== savedName));

    function reset() {
        name = savedName;
        pendingLogo = null;
    }

    async function save() {
        if (!canSave || saving) {
            return;
        }

        saving = true;
        try {
            if (pendingLogo) {
                await uploadLogoMutation.mutateAsync({
                    organizationId: data.organization.id,
                    file: pendingLogo,
                });
            }

            const res = await authClient.organization.update({
                organizationId: data.organization.id,
                data: { name: trimmedName },
            });

            if (res.error) {
                toast.error(res.error.message || "Failed to update the profile");
                return;
            }

            pendingLogo = null;
            toast.success("Profile updated");
            await invalidateAll();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update the profile");
        } finally {
            saving = false;
        }
    }
</script>

<div class="divide-y divide-white/10">
    <Section title="Logo" description="Shown on the profile picker.">
        <AvatarField
            bind:file={pendingLogo}
            currentUrl={data.organization.logo}
            name={name || "Profile"}
            changeLabel="logo"
            editable={canEdit}
            disabled={saving}
        />
    </Section>

    <Section title="Details">
        <div class="max-w-sm">
            <label for="profileName" class="mb-2 block text-sm font-medium">Profile name</label>
            {#if canEdit}
                <Input id="profileName" type="text" bind:value={name} placeholder="Profile name" />
            {:else}
                <p class="rounded-md border border-white/8 px-3 py-2 text-sm text-muted-foreground">{savedName}</p>
            {/if}
        </div>
    </Section>

    <Section title="Usage" description="Media stored for this profile.">
        <dl class="max-w-sm divide-y divide-white/8 border-y border-white/8">
            <div class="flex items-baseline justify-between py-3">
                <dt class="text-sm text-muted-foreground">Media items</dt>
                <dd class="text-sm font-medium tabular-nums">{data.stats.total}</dd>
            </div>
            <div class="flex items-baseline justify-between py-3">
                <dt class="text-sm text-muted-foreground">Storage used</dt>
                <dd class="text-sm font-medium tabular-nums">{formatFileSize(data.stats.totalSize)}</dd>
            </div>
        </dl>
    </Section>
</div>

{#if canEdit}
    <SaveBar dirty={canSave} {saving} onsave={save} onreset={reset} />
{/if}
