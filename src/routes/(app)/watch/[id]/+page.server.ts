import { error } from "@sveltejs/kit";
import { requireMediaAccess } from "$lib/server/api-guard";
import { mediaDb } from "$lib/server/db";
import { getMediaProgressSnapshot } from "$lib/server/media-progress";
import { getSubtitleTracksForMedia } from "$lib/server/subtitles";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ depends, params, locals }) => {
	const { mediaItem, organizationId } = requireMediaAccess(locals, params.id);
	if (mediaItem.type === "show") {
		throw error(400, "Shows are not directly watchable");
	}
	depends(`/api/media/${params.id}`);
	const nextEpisode = mediaItem.type === "episode" ? mediaDb.getNextEpisodeById(mediaItem.id) : null;

	return {
		media: mediaItem,
		nextEpisode: nextEpisode
			? {
					backdropUrl: nextEpisode.backdropUrl,
					episodeNumber: nextEpisode.episodeNumber,
					id: nextEpisode.id,
					posterUrl: nextEpisode.posterUrl,
					seasonNumber: nextEpisode.seasonNumber,
					stillPath: nextEpisode.stillPath,
					title: nextEpisode.title,
				}
			: null,
		progress: getMediaProgressSnapshot(params.id, organizationId),
		subtitleTracks: await getSubtitleTracksForMedia(mediaItem),
	};
};
