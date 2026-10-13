<script lang="ts">
    import { setCaptionSelection } from "$lib/caption-session.svelte";
    import OpenSubtitlesSearch from "$lib/components/OpenSubtitlesSearch.svelte";
    import Dialog from "$lib/components/ui/Dialog.svelte";

    let {
        open = $bindable(false),
        mediaId,
        mediaTitle = "",
        seasonNumber,
        episodeNumber,
    }: {
        open?: boolean;
        mediaId: string;
        mediaTitle?: string;
        seasonNumber?: number;
        episodeNumber?: number | null;
    } = $props();
</script>

<Dialog bind:open title="Search Subtitles" description="Find subtitles for {mediaTitle}" class="max-w-2xl">
    {#if open}
        {#key mediaId}
            <OpenSubtitlesSearch
                {mediaId}
                {seasonNumber}
                {episodeNumber}
                onDownloaded={(track) => setCaptionSelection(track.mediaId, track.id, true)}
            />
        {/key}
    {/if}
</Dialog>
