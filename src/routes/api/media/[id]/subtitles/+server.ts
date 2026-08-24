import { json } from "@sveltejs/kit";
import { requireMediaAccess } from "$lib/server/api-guard";
import { getSubtitleTracksForMedia } from "$lib/server/subtitles";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);
	return json(await getSubtitleTracksForMedia(mediaItem));
};
