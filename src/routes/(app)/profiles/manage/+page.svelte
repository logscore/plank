<script lang="ts">
    import { ArrowLeft, Check, Loader2, Pencil, Trash2, Users, X } from '@lucide/svelte';
    import { tick } from 'svelte';
    import { toast } from 'svelte-sonner';
    import { goto, invalidateAll } from '$app/navigation';
    import { authClient } from '$lib/auth-client';
    import Facehash from '$lib/components/facehash/Facehash.svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import { confirmDelete } from '$lib/ui-state.svelte';
    import type { PageData } from './$types';

    let { data } = $props<{ data: PageData }>();

    // Create form state
    let newName = $state('');
    let creating = $state(false);

    // Edit state
    let editingId = $state<string | null>(null);
    let editName = $state('');
    let saving = $state(false);

    async function createProfile(e: Event) {
        e.preventDefault();
        if (!newName.trim()) {
            return;
        }

        creating = true;
        try {
            const slug = newName
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, '');

            const result = await authClient.organization.create({
                name: newName.trim(),
                slug: slug || `profile-${Date.now()}`,
            });

            if (result.error) {
                toast.error(result.error.message || 'Failed to create profile');
                return;
            }

            newName = '';
            toast.success('Profile created');
            await invalidateAll();
        } catch {
            toast.error('Failed to create profile');
        } finally {
            creating = false;
        }
    }

    async function startEdit(profile: (typeof data.profiles)[0]) {
        editingId = profile.id;
        editName = profile.name;
        await tick();
        const input = document.querySelector<HTMLInputElement>(`[data-edit-input="${profile.id}"]`);
        input?.focus();
        input?.select();
    }

    function cancelEdit() {
        editingId = null;
        editName = '';
    }

    async function saveEdit() {
        if (!(editingId && editName.trim())) {
            return;
        }

        saving = true;
        try {
            const res = await fetch(`/api/profiles/${editingId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editName.trim() }),
            });

            if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || 'Failed to update profile');
                return;
            }

            toast.success('Profile updated');
            editingId = null;
            await invalidateAll();
        } catch {
            toast.error('Failed to update profile');
        } finally {
            saving = false;
        }
    }

    function deleteProfile(profile: (typeof data.profiles)[0]) {
        confirmDelete(
            'Delete Profile',
            `Are you sure you want to delete "${profile.name}"? All media in this profile will be lost.`,
            async () => {
                const res = await fetch(`/api/profiles/${profile.id}`, {
                    method: 'DELETE',
                });
                if (!res.ok) {
                    const data = await res.json();
                    toast.error(data.error || 'Failed to delete profile');
                    return;
                }
                toast.success('Profile deleted');
                await invalidateAll();
            }
        );
    }
</script>

<div class="container mx-auto px-4 py-8 max-w-2xl">
    <!-- Header -->
    <div class="flex items-center gap-4 mb-8">
        <Button variant="ghost" class="p-2" onclick={() => goto("/profiles")}>
            <ArrowLeft class="w-5 h-5" />
        </Button>
        <h1 class="text-3xl font-bold">Manage Profiles</h1>
    </div>

    <!-- Create New Profile -->
    <div class="rounded-xl border border-border bg-card p-6 mb-6">
        <h2 class="text-lg font-semibold mb-4">Create New Profile</h2>
        <form onsubmit={createProfile} class="space-y-4">
            <div class="flex items-center gap-4">
                <Facehash
                    name={newName || ""}
                    size={48}
                    class="rounded-lg text-white shrink-0"
                    intensity3d={newName ? "dramatic" : "none"}
                />
                <div class="flex-1 space-y-2">
                    <label for="profile-name" class="text-sm font-medium">Profile Name</label>
                    <Input
                        type="text"
                        id="profile-name"
                        bind:value={newName}
                        placeholder="e.g. Family, Kids, Movie Night"
                        required
                        class="bg-background/50"
                    />
                </div>
            </div>

            <Button type="submit" disabled={creating || !newName.trim()}>
                {creating ? "Creating..." : "Create Profile"}
            </Button>
        </form>
    </div>

    <!-- Existing Profiles -->
    {#if data.profiles.length > 0}
        <div class="rounded-xl border border-border bg-card p-6">
            <h2 class="text-lg font-semibold mb-4">Existing Profiles</h2>
            <div class="space-y-3">
                {#each data.profiles as profile}
                    <div class="flex items-center justify-between p-4 rounded-lg border border-border bg-background/50">
                        {#if editingId === profile.id}
                            <!-- Edit mode -->
                            <div class="flex items-center gap-3 flex-1">
                                <Facehash
                                    name={editName || "Profile"}
                                    size={40}
                                    class="rounded-lg text-white shrink-0"
                                    interactive={true}
                                    intensity3d="medium"
                                />
                                <div class="relative flex-1">
                                    <input
                                        bind:value={editName}
                                        data-edit-input={profile.id}
                                        placeholder="Profile name"
                                        class="flex h-10 w-full rounded-md border border-input bg-background/50 pl-3 pr-20 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        onkeydown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                saveEdit();
                                            }
                                            if (e.key === "Escape") {
                                                e.preventDefault();
                                                cancelEdit();
                                            }
                                        }}
                                    >
                                    <div class="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                        <button
                                            class="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-white hover:bg-accent transition-colors"
                                            onclick={cancelEdit}
                                            title="Cancel (Esc)"
                                        >
                                            <X class="w-4 h-4" />
                                        </button>
                                        <button
                                            class="flex items-center justify-center w-7 h-7 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                                            onclick={saveEdit}
                                            disabled={saving ||
                                                !editName.trim()}
                                            title="Save (Enter)"
                                        >
                                            {#if saving}
                                                <Loader2 class="w-4 h-4 animate-spin" />
                                            {:else}
                                                <Check class="w-4 h-4" />
                                            {/if}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        {:else}
                            <!-- Display mode -->
                            <div class="flex items-center gap-3">
                                <Facehash
                                    name={profile.name}
                                    size={40}
                                    class="rounded-lg text-white"
                                    interactive={true}
                                    intensity3d={"medium"}
                                />
                                <div>
                                    <p class="font-medium">{profile.name}</p>
                                    <div class="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Users class="w-3 h-3" />
                                        <span
                                            >{profile.memberCount} member
                                            {profile.memberCount !== 1
                                                ? "s"
                                                : ""}</span
                                        >
                                    </div>
                                </div>
                            </div>
                            <div class="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-8 w-8 text-muted-foreground hover:text-primary"
                                    onclick={() => startEdit(profile)}
                                    title="Edit Profile"
                                >
                                    <Pencil class="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onclick={() => deleteProfile(profile)}
                                    title="Delete Profile"
                                >
                                    <Trash2 class="w-4 h-4" />
                                </Button>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>
