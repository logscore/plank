<script lang="ts">
    import { ArrowLeft, CircleAlert, Film, HardDrive, Key, Mail, User } from '@lucide/svelte';
    import { fade } from 'svelte/transition';
    import { authClient } from '$lib/auth-client';
    import Button from '$lib/components/ui/Button.svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import type { PageData } from './$types';

    let { data } = $props<{ data: PageData }>();

    let currentPassword = $state('');
    let newPassword = $state('');
    let confirmPassword = $state('');
    let passwordError = $state('');
    let passwordSuccess = $state('');
    let changingPassword = $state(false);
    /* State for password form visibility */
    let showPasswordForm = $state(false);

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

    /* ... existing formatFileSize ... */

    async function changePassword() {
        /* ... existing changePassword logic ... */
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
