<script lang="ts">
    import { CircleAlert, CircleCheck, Loader } from "@lucide/svelte";
    import { authClient } from "$lib/auth-client";
    import Button from "$lib/components/ui/Button.svelte";
    import Input from "$lib/components/ui/Input.svelte";
    import Section from "../Section.svelte";

    const MIN_PASSWORD_LENGTH = 8;

    let currentPassword = $state("");
    let newPassword = $state("");
    let confirmPassword = $state("");
    let error = $state("");
    let success = $state("");
    let changing = $state(false);

    const complete = $derived(currentPassword.length > 0 && newPassword.length > 0 && confirmPassword.length > 0);

    async function changePassword(event: SubmitEvent) {
        event.preventDefault();
        error = "";
        success = "";

        if (newPassword !== confirmPassword) {
            error = "The new passwords do not match";
            return;
        }

        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            error = `The new password must have ${MIN_PASSWORD_LENGTH} characters or more`;
            return;
        }

        changing = true;
        try {
            const result = await authClient.changePassword({
                currentPassword,
                newPassword,
                revokeOtherSessions: true,
            });

            if (result.error) {
                error = result.error.message || "Failed to change the password";
                return;
            }

            success = "Password changed. Other devices are signed out.";
            currentPassword = "";
            newPassword = "";
            confirmPassword = "";
        } catch {
            error = "Failed to change the password";
        } finally {
            changing = false;
        }
    }
</script>

<div class="divide-y divide-white/10">
    <Section title="Password" description="A change signs you out of all other devices.">
        <form class="max-w-sm space-y-6" onsubmit={changePassword}>
            <div>
                <label for="current-password" class="mb-2 block text-sm font-medium">Current password</label>
                <Input
                    id="current-password"
                    type="password"
                    autocomplete="current-password"
                    bind:value={currentPassword}
                />
            </div>

            <div>
                <label for="new-password" class="mb-2 block text-sm font-medium">New password</label>
                <Input id="new-password" type="password" autocomplete="new-password" bind:value={newPassword} />
                <p class="mt-2 text-xs text-muted-foreground">{MIN_PASSWORD_LENGTH} characters or more.</p>
            </div>

            <div>
                <label for="confirm-password" class="mb-2 block text-sm font-medium">Confirm new password</label>
                <Input id="confirm-password" type="password" autocomplete="new-password" bind:value={confirmPassword} />
            </div>

            {#if error}
                <p class="flex items-start gap-2 text-sm text-destructive">
                    <CircleAlert class="mt-0.5 size-4 shrink-0" />
                    {error}
                </p>
            {/if}

            {#if success}
                <p class="flex items-start gap-2 text-sm text-muted-foreground">
                    <CircleCheck class="mt-0.5 size-4 shrink-0 text-green-500" />
                    {success}
                </p>
            {/if}

            <Button type="submit" disabled={changing || !complete}>
                {#if changing}
                    <Loader class="mr-2 size-4 animate-spin" />
                {/if}
                Change password
            </Button>
        </form>
    </Section>
</div>
