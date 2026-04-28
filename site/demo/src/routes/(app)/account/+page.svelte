<script lang="ts">
    import { Upload, UserPlus } from '@lucide/svelte';
    import { toast } from 'svelte-sonner';
    import Button from '$lib/components/ui/Button.svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import { demoStore } from '$lib/demo/store.svelte';
    import { formatBytes, formatDate } from '$lib/demo/utils';
    import type { DemoMember } from '$lib/types';
    import { uiState } from '$lib/ui-state.svelte';

    let name = $state(demoStore.user.name);
    let email = $state(demoStore.user.email);
    let profileName = $state(demoStore.activeProfile?.name ?? '');
    let currentPassword = $state('');
    let nextPassword = $state('');

    $effect(() => {
        name = demoStore.user.name;
        email = demoStore.user.email;
        profileName = demoStore.activeProfile?.name ?? '';
    });

    function handleUserImage(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            demoStore.updateUser({ image: String(reader.result) });
            toast.success('Avatar updated');
        };
        reader.readAsDataURL(file);
    }

    function handleProfileImage(event: Event) {
        if (!demoStore.activeProfile) {
            return;
        }
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            demoStore.updateProfile(demoStore.activeProfile!.id, { logo: String(reader.result) });
            toast.success('Profile artwork updated');
        };
        reader.readAsDataURL(file);
    }

    function saveUser() {
        demoStore.updateUser({ name, email });
        toast.success('Account updated');
    }

    function saveProfile() {
        if (!demoStore.activeProfile) {
            return;
        }
        demoStore.updateProfile(demoStore.activeProfile.id, { name: profileName || 'Profile' });
        toast.success('Profile updated');
    }

    function savePassword() {
        if (!(currentPassword && nextPassword)) {
            toast.error('Enter both password fields');
            return;
        }
        currentPassword = '';
        nextPassword = '';
        toast.success('Password updated locally');
    }

    function handleRoleChange(memberId: string, event: Event) {
        if (!demoStore.activeProfile) {
            return;
        }

        demoStore.updateMemberRole(
            demoStore.activeProfile.id,
            memberId,
            (event.currentTarget as HTMLSelectElement).value as DemoMember['role']
        );
    }

    const stats = $derived(demoStore.getStats());
    const members = $derived<DemoMember[]>(demoStore.getMembers());
    const invitations = $derived(demoStore.getInvitations());
</script>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div class="mb-8">
        <h1 class="text-3xl font-semibold tracking-tight">Account</h1>
        <p class="mt-2 text-sm text-muted-foreground">
            Manage the current profile, avatar, invites, and local settings.
        </p>
    </div>

    <div class="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div class="space-y-6">
            <section class="rounded-2xl border border-white/10 bg-card/60 p-6">
                <div class="mb-5 flex items-center justify-between gap-3">
                    <div>
                        <h2 class="text-xl font-semibold">User</h2>
                        <p class="text-sm text-muted-foreground">Edit the user shown in the account menu.</p>
                    </div>
                    <label
                        class="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                    >
                        <Upload class="h-4 w-4" />
                        Avatar
                        <input type="file" accept="image/*" class="hidden" onchange={handleUserImage}>
                    </label>
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                    <div class="space-y-2">
                        <label for="account-name" class="text-sm font-medium">Display Name</label>
                        <Input id="account-name" bind:value={name} class="bg-background/50" />
                    </div>
                    <div class="space-y-2">
                        <label for="account-email" class="text-sm font-medium">Email</label>
                        <Input id="account-email" bind:value={email} type="email" class="bg-background/50" />
                    </div>
                </div>

                <div class="mt-4 flex justify-end">
                    <Button onclick={saveUser}>Save Account</Button>
                </div>
            </section>

            <section class="rounded-2xl border border-white/10 bg-card/60 p-6">
                <div class="mb-5 flex items-center justify-between gap-3">
                    <div>
                        <h2 class="text-xl font-semibold">Active Profile</h2>
                        <p class="text-sm text-muted-foreground">Rename the current profile and update its artwork.</p>
                    </div>
                    <label
                        class="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                    >
                        <Upload class="h-4 w-4" />
                        Artwork
                        <input type="file" accept="image/*" class="hidden" onchange={handleProfileImage}>
                    </label>
                </div>
                <div class="space-y-2">
                    <label for="profile-name" class="text-sm font-medium">Profile Name</label>
                    <Input id="profile-name" bind:value={profileName} class="bg-background/50" />
                </div>
                <div class="mt-4 flex justify-end">
                    <Button onclick={saveProfile}>Save Profile</Button>
                </div>
            </section>

            <section class="rounded-2xl border border-white/10 bg-card/60 p-6">
                <div class="mb-5 flex items-center justify-between gap-3">
                    <div>
                        <h2 class="text-xl font-semibold">Members & Invites</h2>
                        <p class="text-sm text-muted-foreground">
                            Team members and invite links are stored per profile in this browser.
                        </p>
                    </div>
                    <Button variant="secondary" onclick={() => uiState.toggleInviteMemberDialog()}>
                        <UserPlus class="mr-2 h-4 w-4" />
                        Invite Member
                    </Button>
                </div>

                <div class="space-y-3">
                    {#each members as member}
                        <div
                            class="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                            <div>
                                <p class="font-medium">{member.name}</p>
                                <p class="text-sm text-muted-foreground">{member.email}</p>
                            </div>
                            <select
                                class="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                value={member.role}
                                onchange={(event) => handleRoleChange(member.id, event)}
                            >
                                <option value="owner">Owner</option>
                                <option value="admin">Admin</option>
                                <option value="member">Member</option>
                            </select>
                        </div>
                    {/each}
                </div>

                {#if invitations.length > 0}
                    <div class="mt-5 border-t border-white/10 pt-5">
                        <h3 class="mb-3 font-medium">Pending Invites</h3>
                        <div class="space-y-2">
                            {#each invitations as invite}
                                <div
                                    class="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm"
                                >
                                    <div>
                                        <p>{invite.email}</p>
                                        <p class="text-xs text-muted-foreground">
                                            Created {formatDate(invite.createdAt)}
                                        </p>
                                    </div>
                                    <span class="rounded-full bg-white/10 px-3 py-1 text-xs uppercase"
                                        >{invite.status}</span
                                    >
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </section>
        </div>

        <div class="space-y-6">
            <section class="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
                <div class="rounded-2xl border border-white/10 bg-card/60 p-5">
                    <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Media</p>
                    <p class="mt-2 text-3xl font-semibold">{stats.totalMedia}</p>
                </div>
                <div class="rounded-2xl border border-white/10 bg-card/60 p-5">
                    <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Storage</p>
                    <p class="mt-2 text-3xl font-semibold">{formatBytes(stats.totalSize)}</p>
                </div>
                <div class="rounded-2xl border border-white/10 bg-card/60 p-5">
                    <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Errors</p>
                    <p class="mt-2 text-3xl font-semibold">{stats.errorCount}</p>
                </div>
            </section>

            <section class="rounded-2xl border border-white/10 bg-card/60 p-6">
                <h2 class="text-xl font-semibold">Change Password</h2>
                <p class="mt-1 text-sm text-muted-foreground">Changes here are kept locally in this browser.</p>
                <div class="mt-5 space-y-4">
                    <div class="space-y-2">
                        <label for="current-password" class="text-sm font-medium">Current Password</label>
                        <Input
                            id="current-password"
                            bind:value={currentPassword}
                            type="password"
                            class="bg-background/50"
                        />
                    </div>
                    <div class="space-y-2">
                        <label for="next-password" class="text-sm font-medium">New Password</label>
                        <Input id="next-password" bind:value={nextPassword} type="password" class="bg-background/50" />
                    </div>
                </div>
                <div class="mt-4 flex justify-end">
                    <Button onclick={savePassword}>Update Password</Button>
                </div>
            </section>
        </div>
    </div>
</div>
