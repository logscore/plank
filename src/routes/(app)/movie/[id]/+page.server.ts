import { requireMediaAccess } from "$lib/server/api-guard";
import { getMediaProgressSnapshot } from "$lib/server/media-progress";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	const { mediaItem, organizationId } = requireMediaAccess(locals, params.id);
	return { media: mediaItem, progress: getMediaProgressSnapshot(params.id, organizationId) };
};
