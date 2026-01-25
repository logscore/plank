<script lang="ts">
    import {
        ArrowLeft,
        CircleAlert,
        Film,
        HardDrive,
        Key,
        Mail,
        Shield,
        ShieldAlert,
        ShieldCheck,
        Trash2,
        User,
        UserPlus,
        Users,
        X,
    } from '@lucide/svelte';
    import { fade } from 'svelte/transition';
    import { toast } from 'svelte-sonner';
    import { invalidateAll } from '$app/navigation';
    import { authClient } from '$lib/auth-client';
    import Button from '$lib/components/ui/Button.svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import { confirmDelete, uiState } from '$lib/ui-state.svelte';
    import type { PageData } from './$types';

    let { data } = $props<{ data: PageData }>();

    let currentPassword = $state('');
    let newPassword = $state('');
    let confirmPassword = $state('');
    let passwordError = $state('');
    let passwordSuccess = $state('');
    let changingPassword = $state(false);
    let showPasswordForm = $state(false);

    async function updateRole(memberId: string, memberName: string, newRole: 'admin' | 'member') {
        const action = newRole === 'admin' ? 'Promote' : 'Demote';

        confirmDelete(
            `${action} Member`,
            `Are you sure you want to ${action.toLowerCase()} ${memberName} to ${newRole}?`,
            async () => {
                try {
                    const res = await authClient.organization.updateMemberRole({
                        memberId,
                        role: newRole,
                        organizationId: data.organization.id,
                    });
                    if (res.error) {
                        console.error('Failed to update role:', res.error);
                        toast.error(`Failed to update role: ${res.error.message}`);
                    } else {
                        toast.success('Role updated successfully');
                        await invalidateAll();
                    }
                } catch (e) {
                    console.error('Exception updating role:', e);
                    toast.error('An unexpected error occurred');
                }
            }
        );
    }

    async function removeMember(memberId: string, memberName: string) {
        confirmDelete(
            'Remove Member',
            `Are you sure you want to remove ${memberName} from the organization?`,
            async () => {
                const res = await authClient.organization.removeMember({
                    memberIdOrEmail: memberId,
                    organizationId: data.organization.id,
                });
                if (res.error?.message) {
                    toast.error(res.error.message);
                } else {
                    await invalidateAll();
                }
            }
        );
    }

    async function revokeInvitation(invitationId: string, email: string) {
        confirmDelete('Revoke Invitation', `Are you sure you want to revoke the invitation for ${email}?`, async () => {
            const res = await authClient.organization.cancelInvitation({
                invitationId,
            });
            if (res.error) {
                toast.error(res.error.message);
            } else {
                toast.success('Invitation revoked');
                await invalidateAll();
            }
        });
    }
    function formatFileSize(bytes: number): string {
        if (bytes < 1024) {
            return `${bytes} B`;
        }
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }
        if (bytes < 1024 * 1024 * 1024) {
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        }
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    async function changePassword() {
        passwordError = '';
        passwordSuccess = '';

        if (!(currentPassword && newPassword && confirmPassword)) {
            passwordError = 'All fields are required';
            return;
        }

        if (newPassword !== confirmPassword) {
            passwordError = 'New passwords do not match';
            return;
        }

        if (newPassword.length < 8) {
            passwordError = 'New password must be at least 8 characters';
            return;
        }

        changingPassword = true;
        try {
            const result = await authClient.changePassword({
                currentPassword,
                newPassword,
                revokeOtherSessions: true,
            });

            if (result.error) {
                passwordError = result.error.message || 'Failed to change password';
            } else {
                passwordSuccess = 'Password changed successfully';
                currentPassword = '';
                newPassword = '';
                confirmPassword = '';
                setTimeout(() => {
                    showPasswordForm = false;
                }, 2000);
            }
        } catch (e) {
            passwordError = 'Failed to change password';
        } finally {
            changingPassword = false;
        }
    }
</script>

<div class="container mx-auto px-4 py-8 max-w-4xl">
    <!-- Header -->
    <div class="flex items-center gap-4 mb-8">
        <Button variant="ghost" class="p-2" onclick={() => window.history.back()}>
            <ArrowLeft class="w-5 h-5" />
        </Button>
        <h1 class="text-3xl font-bold">Account</h1>
    </div>

    <!-- User Info Card -->
    <div class="rounded-xl border border-border bg-card p-6 mb-6">
        <div class="flex items-center gap-4 mb-6">
            <div class="w-16 h-16 rounded-full bg-accent flex items-center justify-center">
                <User class="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
                <h2 class="text-xl font-semibold">{data.user.name || "User"}</h2>
                <div class="flex items-center gap-2 text-muted-foreground">
                    <Mail class="w-4 h-4" />
                    <span>{data.user.email}</span>
                </div>
            </div>
        </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="rounded-xl border border-border bg-card p-4">
            <div class="flex items-center gap-3 mb-2">
                <Film class="w-5 h-5 text-primary" />
                <span class="text-sm text-muted-foreground">Total Media</span>
            </div>
            <div class="text-2xl font-bold">{data.stats.total}</div>
        </div>

        <div class="rounded-xl border border-border bg-card p-4">
            <div class="flex items-center gap-3 mb-2">
                <HardDrive class="w-5 h-5 text-orange-500" />
                <span class="text-sm text-muted-foreground">Storage Used</span>
            </div>
            <div class="text-2xl font-bold">{formatFileSize(data.stats.totalSize)}</div>
        </div>
    </div>

    <!-- Organization -->
    {#if data.organization}
        <div class="rounded-xl border border-border bg-card p-6 mb-6">
            <div class="flex items-center justify-between mb-6">
                <div class="flex items-center gap-3">
                    <Users class="w-5 h-5 text-primary" />
                    <h3 class="text-lg font-semibold">Organization: {data.organization.name}</h3>
                </div>
                {#if data.userRole === "owner" || data.userRole === "admin"}
                    <Button variant="secondary" size="sm" onclick={() => uiState.toggleInviteMemberDialog()}>
                        <UserPlus class="w-4 h-4 mr-2" />
                        Invite Member
                    </Button>
                {/if}
            </div>

            <div class="space-y-6">
                <!-- Members -->
                <div>
                    <h4 class="text-sm font-medium text-muted-foreground mb-3">Members</h4>
                    <div class="space-y-2">
                        {#each data.members as member}
                            <div
                                class="flex items-center justify-between p-3 rounded-lg border border-border bg-background/50"
                            >
                                <div class="flex items-center gap-3">
                                    <div class="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                                        <User class="w-4 h-4 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <p class="font-medium text-sm">{member.user.name}</p>
                                        <p class="text-xs text-muted-foreground">{member.user.email}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary capitalize">
                                        {member.role}
                                    </span>

                                    {#if (data.userRole === "owner" || data.userRole === "admin") && member.userId !== data.user.id}
                                        <!-- Role Management (Owner Only) -->
                                        {#if data.userRole === "owner"}
                                            {#if member.role === "member"}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    class="h-8 w-8 text-muted-foreground hover:text-primary"
                                                    title="Promote to Admin"
                                                    onclick={() =>
                                                        updateRole(
                                                            member.id,
                                                            member.user.name ||
                                                                member.user
                                                                    .email,
                                                            "admin",
                                                        )}
                                                >
                                                    <ShieldCheck class="w-4 h-4" />
                                                </Button>
                                            {:else if member.role === "admin"}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    class="h-8 w-8 text-muted-foreground hover:text-orange-500"
                                                    title="Demote to Member"
                                                    onclick={() =>
                                                        updateRole(
                                                            member.id,
                                                            member.user.name ||
                                                                member.user
                                                                    .email,
                                                            "member",
                                                        )}
                                                >
                                                    <ShieldAlert class="w-4 h-4" />
                                                </Button>
                                            {/if}
                                        {/if}

                                        <!-- Remove Member -->
                                        {#if data.userRole === "owner" || (data.userRole === "admin" && member.role === "member")}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                class="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                title="Remove Member"
                                                onclick={() =>
                                                    removeMember(
                                                        member.id,
                                                        member.user.name ||
                                                            member.user.email,
                                                    )}
                                            >
                                                <Trash2 class="w-4 h-4" />
                                            </Button>
                                        {/if}
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>

                <!-- Invitations -->
                {#if data.invitations.length > 0}
                    <div>
                        <h4 class="text-sm font-medium text-muted-foreground mb-3">Pending Invitations</h4>
                        <div class="space-y-2">
                            {#each data.invitations as invite}
                                <div
                                    class="flex items-center justify-between p-3 rounded-lg border border-border bg-background/50 border-dashed"
                                >
                                    <div class="flex items-center gap-3">
                                        <div class="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                            <Mail class="w-4 h-4 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <p class="font-medium text-sm">{invite.email}</p>
                                            <p class="text-xs text-muted-foreground">
                                                Expires:
                                                {new Date(
                                                    invite.expiresAt,
                                                ).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span
                                            class="text-xs px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-500 capitalize"
                                        >
                                            Pending
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            class="h-8 w-8 text-muted-foreground hover:text-destructive"
                                            onclick={() =>
                                                revokeInvitation(
                                                    invite.id,
                                                    invite.email,
                                                )}
                                        >
                                            <X class="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    <!-- Error Movies -->
    {#if data.stats.error > 0}
        <div class="rounded-xl border border-red-500/30 bg-red-500/10 p-4 mb-6">
            <div class="flex items-center gap-3">
                <CircleAlert class="w-5 h-5 text-red-500" />
                <span class="text-red-400">{data.stats.error} item(s) with download errors</span>
            </div>
        </div>
    {/if}

    <!-- Change Password -->
    <div class="rounded-xl border border-border bg-card p-6">
        <div class="flex items-center gap-3 mb-6">
            <Key class="w-5 h-5 text-primary" />
            <h3 class="text-lg font-semibold">Security</h3>
        </div>

        {#if !showPasswordForm}
            <div class="mb-4">
                <Button variant="outline" onclick={() => (showPasswordForm = true)}>Reset Password</Button>
            </div>
        {/if}

        {#if showPasswordForm}
            <div class="space-y-4 max-w-md" transition:fade>
                <div>
                    <label for="current-password" class="block text-sm text-muted-foreground mb-2">
                        Current Password
                    </label>
                    <Input
                        id="current-password"
                        type="password"
                        placeholder="Enter current password"
                        bind:value={currentPassword}
                    />
                </div>

                <div>
                    <label for="new-password" class="block text-sm text-muted-foreground mb-2">New Password</label>
                    <Input
                        id="new-password"
                        type="password"
                        placeholder="Enter new password"
                        bind:value={newPassword}
                    />
                </div>

                <div>
                    <label for="confirm-password" class="block text-sm text-muted-foreground mb-2">
                        Confirm New Password
                    </label>
                    <Input
                        id="confirm-password"
                        type="password"
                        placeholder="Confirm new password"
                        bind:value={confirmPassword}
                    />
                </div>

                {#if passwordError}
                    <p class="text-sm text-red-400">{passwordError}</p>
                {/if}

                {#if passwordSuccess}
                    <p class="text-sm text-green-400">{passwordSuccess}</p>
                {/if}

                <p class="text-sm text-white/70">This will sign you out of all other devices</p>

                <div class="flex gap-2">
                    <Button onclick={changePassword} disabled={changingPassword}>
                        {changingPassword ? "Changing..." : "Change Password"}
                    </Button>
                    <Button variant="ghost" onclick={() => (showPasswordForm = false)}>Cancel</Button>
                </div>
            </div>
        {/if}
    </div>
</div>
