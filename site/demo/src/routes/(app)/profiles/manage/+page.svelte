<script lang="ts">
    import { ImagePlus, Pencil, Trash2 } from '@lucide/svelte';
    import { toast } from 'svelte-sonner';
    import { goto } from '$app/navigation';
    import Facehash from '$lib/components/facehash/Facehash.svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import { demoStore } from '$lib/demo/store.svelte';
    import { confirmDelete } from '$lib/ui-state.svelte';

    let newProfileName = $state('');
    let editingId = $state<string | null>(null);
    let draftName = $state('');

    function createProfile() {
        const profile = demoStore.createProfile(newProfileName);
        if (!profile) {
            return;
        }

        newProfileName = '';
        toast.success(`${profile.name} created`);
    }

    function startEditing(profileId: string, currentName: string) {
        editingId = profileId;
        draftName = currentName;
    }

    function saveProfile(profileId: string) {
        demoStore.updateProfile(profileId, { name: draftName.trim() || 'Profile' });
        editingId = null;
        toast.success('Profile updated');
    }

    function handleLogoUpload(profileId: string, event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            demoStore.updateProfile(profileId, { logo: String(reader.result) });
            toast.success('Profile artwork updated');
        };
        reader.readAsDataURL(file);
    }

    function removeProfile(profileId: string, name: string) {
        confirmDelete('Delete profile', `Remove ${name} from this app?`, async () => {
            const removed = demoStore.deleteProfile(profileId);
            if (removed) {
                toast.success(`${name} removed`);
            } else {
                toast.error('Keep at least one profile');
            }
        });
    }
</script>

<div class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex items-center justify-between gap-4">
        <div>
            <h1 class="text-3xl font-semibold tracking-tight">Manage Profiles</h1>
            <p class="mt-2 text-sm text-muted-foreground">
                Profile names, artwork, and libraries are stored in your browser.
            </p>
        </div>
        <Button variant="secondary" onclick={() => goto('/profiles')}>Back</Button>
    </div>

    <div class="mb-8 rounded-2xl border border-white/10 bg-card/60 p-5">
        <h2 class="mb-4 text-lg font-semibold">Create Profile</h2>
        <div class="flex flex-col gap-3 sm:flex-row">
            <Input bind:value={newProfileName} placeholder="Scallywag" class="bg-background/50" />
            <Button onclick={createProfile}>Create</Button>
        </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each demoStore.profiles as profile}
            <div class="rounded-2xl border border-white/10 bg-card/60 p-5 shadow-lg">
                <div class="mb-4 flex items-center gap-4">
                    <div class="overflow-hidden rounded-xl">
                        {#if profile.logo}
                            <img src={profile.logo} alt={profile.name} class="h-18 w-18 object-cover">
                        {:else}
                            <Facehash name={profile.name} size={72} variant="solid" class="rounded-xl" />
                        {/if}
                    </div>
                    <div class="min-w-0 flex-1">
                        {#if editingId === profile.id}
                            <div class="flex gap-2">
                                <Input bind:value={draftName} class="bg-background/50" />
                                <Button size="sm" onclick={() => saveProfile(profile.id)}>Save</Button>
                            </div>
                        {:else}
                            <h3 class="truncate text-lg font-semibold">{profile.name}</h3>
                            <p class="text-sm text-muted-foreground">{profile.memberCount} members</p>
                        {/if}
                    </div>
                </div>

                <div class="flex flex-wrap gap-2">
                    <label
                        class="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                    >
                        <ImagePlus class="h-4 w-4" />
                        Artwork
                        <input
                            type="file"
                            accept="image/*"
                            class="hidden"
                            onchange={(event) => handleLogoUpload(profile.id, event)}
                        >
                    </label>
                    <Button variant="secondary" size="sm" onclick={() => startEditing(profile.id, profile.name)}>
                        <Pencil class="mr-2 h-4 w-4" />
                        Rename
                    </Button>
                    <Button variant="destructive" size="sm" onclick={() => removeProfile(profile.id, profile.name)}>
                        <Trash2 class="mr-2 h-4 w-4" />
                        Delete
                    </Button>
                </div>
            </div>
        {/each}
    </div>
</div>
