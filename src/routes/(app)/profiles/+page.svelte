<script lang="ts">
    import { LogOut, Plus, Settings } from "@lucide/svelte";
    import { toast } from "svelte-sonner";
    import { goto } from "$app/navigation";
    import { authClient } from "$lib/auth-client";
    import ProfileCard from "$lib/components/ProfileCard.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import { queryClient } from "$lib/data/client";
    import type { PageData } from "./$types";

    let { data } = $props<{ data: PageData }>();

    async function selectProfile(profileId: string) {
        try {
            const result = await authClient.organization.setActive({
                organizationId: profileId,
            });
            if (result.error) {
                toast.error("Failed to select profile");
                return;
            }
            queryClient.clear();
            goto("/", { invalidateAll: true });
        } catch {
            toast.error("Failed to select profile");
        }
    }

    async function handleLogout() {
        await authClient.signOut();
        goto("/login");
    }

    const accessibleProfiles = $derived(data.profiles.filter((p: (typeof data.profiles)[number]) => p.isMember));
    const hasProfiles = $derived(data.profiles.length > 0);
</script>

<div
    class="mx-auto flex min-h-[calc(100vh-6rem)] max-w-6xl flex-col items-center justify-center px-6 py-12 text-center"
>
    {#if !hasProfiles && !data.canManageProfiles}
        <!-- User with no profile memberships: waiting state -->
        <div class="max-w-md rounded-3xl border border-white/10 bg-card/60 p-8 text-center shadow-xl">
            <div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white/5">
                <Settings class="h-10 w-10 text-muted-foreground" />
            </div>
            <h1 class="mb-3 text-2xl font-semibold tracking-tight">Waiting for access</h1>
            <p class="mb-8 text-muted-foreground">You need an invitation to a profile before you can start watching.</p>
            <Button variant="outline" onclick={handleLogout}>
                <LogOut class="w-4 h-4 mr-2" />
                Sign Out
            </Button>
        </div>
    {:else}
        <!-- Profile picker -->
        <div class="mb-10 space-y-3">
            <h1 class="text-4xl font-semibold tracking-tight sm:text-5xl">Who's watching?</h1>
        </div>

        <div
            class="mb-12 grid max-h-100 grid-cols-2 gap-8 overflow-auto p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
        >
            {#each data.profiles as profile}
                <ProfileCard
                    name={profile.name}
                    logo={profile.logo}
                    isMember={profile.isMember}
                    onclick={() => selectProfile(profile.id)}
                />
            {/each}
        </div>

        {#if data.canManageProfiles}
            <div class="flex flex-wrap items-center justify-center gap-3">
                <Button variant="outline" onclick={() => goto("/profiles/manage")}>
                    <Plus class="w-4 h-4 mr-2" />
                    Manage Profiles
                </Button>
            </div>
        {/if}
    {/if}
</div>
