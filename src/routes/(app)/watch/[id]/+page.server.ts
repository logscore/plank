import { error } from '@sveltejs/kit';
import { requireMediaAccess } from '$lib/server/api-guard';
import { getMediaProgressSnapshot } from '$lib/server/media-progress';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { mediaItem, organizationId } = requireMediaAccess(locals, params.id);
	if (mediaItem.type === 'show') {
		throw error(400, 'Shows are not directly watchable');
	}
	return {
		media: mediaItem,
		progress: getMediaProgressSnapshot(params.id, organizationId),
	};
};
