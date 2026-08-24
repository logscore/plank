import { requireMediaAccess } from "$lib/server/api-guard";
import { getMediaProgressSnapshot } from "$lib/server/media-progress";
import { getSubtitleTracksForMedia } from "$lib/server/subtitles";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ depends, params, locals }) => {
	const { mediaItem, organizationId } = requireMediaAccess(locals, params.id);
	depends(`/api/media/${params.id}`);
	return {
		media: mediaItem,
		progress: getMediaProgressSnapshot(params.id, organizationId),
		subtitleTracks: await getSubtitleTracksForMedia(mediaItem),
	};
};
