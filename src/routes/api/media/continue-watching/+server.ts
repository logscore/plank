import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/api-guard';
import { mediaDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const { organizationId } = requireAuth(locals);
	return json(mediaDb.getRecentlyWatched(organizationId, 20));
};
