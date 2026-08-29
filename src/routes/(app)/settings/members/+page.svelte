<script lang="ts">
    import { EllipsisVertical } from "@lucide/svelte";
    import { DropdownMenu } from "bits-ui";
    import { toast } from "svelte-sonner";
    import { invalidateAll } from "$app/navigation";
    import { authClient } from "$lib/auth-client";
    import Facehash from "$lib/components/facehash/Facehash.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import { confirmDelete, openConfirmation, uiState } from "$lib/ui-state.svelte";
    import Section from "../Section.svelte";
    import type { PageData } from "./$types";

    const MENU_ITEM_CLASS =
        "flex h-9 cursor-default select-none items-center rounded-md px-3 text-sm outline-none data-highlighted:bg-white/10";

    let { data } = $props<{ data: PageData }>();
    const isOwner = $derived(data.userRole === "owner");

    function memberName(member: { user: { name: string | null; email: string } }): string {
        return member.user.name || member.user.email;
    }

    function canRemove(role: string): boolean {
        return isOwner || role === "member";
    }

    async function updateRole(memberId: string, name: string, newRole: "admin" | "member") {
        const label = newRole === "admin" ? "Make admin" : "Make member";

        openConfirmation({
            title: label,
            description: `Change the role of ${name} to ${newRole}?`,
            confirmLabel: label,
            onConfirm: async () => {
                const res = await authClient.organization.updateMemberRole({
                    memberId,
                    role: newRole,
                    organizationId: data.organization.id,
                });
                if (res.error) {
                    toast.error(`Failed to update the role: ${res.error.message}`);
                    return;
                }
                toast.success("Role updated");
                await invalidateAll();
            },
        });
    }

    async function removeMember(memberId: string, name: string) {
        confirmDelete("Remove member", `Remove ${name} from this profile?`, async () => {
            const res = await authClient.organization.removeMember({
                memberIdOrEmail: memberId,
                organizationId: data.organization.id,
            });
            if (res.error?.message) {
                toast.error(res.error.message);
                return;
            }
            await invalidateAll();
        });
    }

    async function revokeInvitation(invitationId: string, email: string) {
        confirmDelete("Revoke invitation", `Revoke the invitation for ${email}?`, async () => {
            const res = await authClient.organization.cancelInvitation({ invitationId });
            if (res.error) {
                toast.error(res.error.message || "Failed to revoke the invitation");
                return;
            }
            await invalidateAll();
        });
    }
</script>

<div class="divide-y divide-white/10">
    <Section title="Members" description="People who share this profile.">
        {#snippet action()}
            <Button variant="outline" size="sm" onclick={() => uiState.toggleInviteMemberDialog()}>
                Invite member
            </Button>
        {/snippet}

        <ul class="divide-y divide-white/8 border-y border-white/8">
            {#each data.members as member (member.id)}
                {@const name = memberName(member)}
                {@const isSelf = member.userId === data.user.id}
                <li class="flex items-center gap-4 py-4">
                    {#if member.user.image}
                        <img src={member.user.image} alt={name} class="size-9 shrink-0 rounded-full object-cover">
                    {:else}
                        <Facehash class="shrink-0 rounded-full" name={name} variant="gradient" size={36} />
                    {/if}

                    <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-medium">
                            {name}
                            {#if isSelf}
                                <span class="text-muted-foreground">(you)</span>
                            {/if}
                        </p>
                        <p class="truncate text-xs text-muted-foreground">{member.user.email}</p>
                    </div>

                    <span class="shrink-0 text-sm capitalize text-muted-foreground">{member.role}</span>

                    {#if !isSelf && canRemove(member.role)}
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger
                                aria-label={`Actions for ${name}`}
                                class="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <EllipsisVertical class="size-4" />
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                                <DropdownMenu.Content
                                    align="end"
                                    sideOffset={6}
                                    class="z-50 w-48 rounded-xl border border-white/10 bg-zinc-950 p-1.5 text-gray-200 shadow-2xl focus:outline-none"
                                >
                                    {#if isOwner && member.role === "member"}
                                        <DropdownMenu.Item
                                            onSelect={() => updateRole(member.id, name, "admin")}
                                            class={MENU_ITEM_CLASS}
                                        >
                                            Make admin
                                        </DropdownMenu.Item>
                                    {:else if isOwner && member.role === "admin"}
                                        <DropdownMenu.Item
                                            onSelect={() => updateRole(member.id, name, "member")}
                                            class={MENU_ITEM_CLASS}
                                        >
                                            Make member
                                        </DropdownMenu.Item>
                                    {/if}

                                    {#if canRemove(member.role)}
                                        <DropdownMenu.Item
                                            onSelect={() => removeMember(member.id, name)}
                                            class="{MENU_ITEM_CLASS} text-red-400 data-highlighted:bg-red-500/10"
                                        >
                                            Remove from profile
                                        </DropdownMenu.Item>
                                    {/if}
                                </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                    {:else}
                        <span class="size-8 shrink-0"></span>
                    {/if}
                </li>
            {/each}
        </ul>
    </Section>

    {#if data.invitations.length > 0}
        <Section title="Pending invitations" description="Invitations that nobody accepted yet.">
            <ul class="divide-y divide-white/8 border-y border-white/8">
                {#each data.invitations as invite (invite.id)}
                    <li class="flex items-center gap-4 py-4">
                        <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-medium">{invite.email}</p>
                            <p class="truncate text-xs text-muted-foreground">
                                Expires {new Date(invite.expiresAt).toLocaleDateString()}
                            </p>
                        </div>
                        <Button variant="ghost" size="sm" onclick={() => revokeInvitation(invite.id, invite.email)}>
                            Revoke
                        </Button>
                    </li>
                {/each}
            </ul>
        </Section>
    {/if}
</div>
