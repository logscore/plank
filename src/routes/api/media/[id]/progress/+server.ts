import { json } from '@sveltejs/kit';
import { requireMediaAccess } from '$lib/server/api-guard';
import { getMediaProgressSnapshot } from '$lib/server/media-progress';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { organizationId } = requireMediaAccess(locals, params.id);
	return json(getMediaProgressSnapshot(params.id, organizationId));
};
