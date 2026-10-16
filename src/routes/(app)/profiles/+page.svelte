<script lang="ts">
    import { Plus } from "@lucide/svelte";
    import { toast } from "svelte-sonner";
    import { goto } from "$app/navigation";
    import { authClient } from "$lib/auth-client";
    import ProfileCard from "$lib/components/ProfileCard.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import Scroller from "$lib/components/ui/Scroller.svelte";
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
</script>

<div
    class="mx-auto flex min-h-[calc(100vh-6rem)] max-w-6xl flex-col items-center justify-center px-6 py-12 text-center"
>
    <!-- Profile picker -->
    <div class="mb-10 space-y-3">
        <h1 class="text-4xl font-semibold tracking-tight sm:text-5xl">Who's watching?</h1>
    </div>

    <Scroller class="max-h-100 p-4" rootClass="mb-12">
        <div class="grid grid-cols-2 gap-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {#each data.profiles as profile}
                <ProfileCard
                    name={profile.name}
                    logo={profile.logo}
                    isMember={profile.isMember}
                    onclick={() => selectProfile(profile.id)}
                />
            {/each}
        </div>
    </Scroller>

    {#if data.canManageProfiles}
        <div class="flex flex-wrap items-center justify-center gap-3">
            <Button variant="outline" onclick={() => goto("/profiles/manage")}>
                <Plus class="w-4 h-4 mr-2" />
                Manage Profiles
            </Button>
        </div>
    {/if}
</div>
