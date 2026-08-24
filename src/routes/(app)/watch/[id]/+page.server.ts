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
	return {
		media: mediaItem,
		progress: getMediaProgressSnapshot(params.id, organizationId),
		nextEpisode: mediaItem.type === "episode" ? mediaDb.getNextEpisodeById(mediaItem.id) : null,
		position: {
			position: mediaItem.playPosition ?? 0,
			duration: mediaItem.playDuration ?? null,
		},
		subtitleTracks: await getSubtitleTracksForMedia(mediaItem),
	};
};
