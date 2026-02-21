import { error, json } from '@sveltejs/kit';
import { mediaDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		throw error(400, 'No active profile selected');
	}

	const items = mediaDb.getRecentlyWatched(organizationId, 20);
	return json(items);
};
