import { error } from "@sveltejs/kit";
import { requireMediaAccess } from "$lib/server/api-guard";
import { seasonsDb } from "$lib/server/db";
import { getMediaProgressSnapshot, type MediaProgressSnapshot } from "$lib/server/media-progress";
import { getSubtitleTracksForMedia } from "$lib/server/subtitles";
import type { Media, SeasonWithEpisodes, SubtitleTrackResponse } from "$lib/types";
import type { PageServerLoad } from "./$types";

interface ShowPageData {
	media: Media;
	seasons: SeasonWithEpisodes[];
	episodeProgressByMediaId: Record<string, MediaProgressSnapshot | null>;
	subtitleTracksByMediaId: Record<string, SubtitleTrackResponse[]>;
}

export const load: PageServerLoad<ShowPageData> = async ({ depends, locals, params }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);
	if (mediaItem.type !== "show") {
		throw error(400, "Not a show");
	}

	depends(`/api/media/${params.id}`);

	const seasons = seasonsDb.getWithEpisodes(params.id);
	const episodes = seasons.flatMap((season) => season.episodes);
	const episodeProgressByMediaId = Object.fromEntries(
		episodes.map((episode) => [
			episode.id,
			getMediaProgressSnapshot(episode.id, mediaItem.organizationId ?? undefined),
		])
	);
	const subtitleTracksByMediaId = Object.fromEntries(
		await Promise.all(
			episodes.map(async (episode) => [episode.id, await getSubtitleTracksForMedia(episode)] as const)
		)
	);

	return { media: mediaItem, seasons, episodeProgressByMediaId, subtitleTracksByMediaId };
};
