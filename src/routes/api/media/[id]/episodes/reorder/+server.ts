import { error, json } from '@sveltejs/kit';
import { episodesDb, mediaDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const mediaItem = mediaDb.get(params.id, locals.user.id);
	if (!mediaItem) {
		throw error(404, 'Media not found');
	}

	if (mediaItem.type !== 'tv') {
		throw error(400, 'Not a TV show');
	}

	const body = await request.json();
	const { episodeOrders } = body;

	if (!Array.isArray(episodeOrders)) {
		throw error(400, 'Invalid episode orders');
	}

	// Validate and update
	for (const item of episodeOrders) {
		const { id, displayOrder } = item;
		if (typeof id !== 'string' || typeof displayOrder !== 'number') {
			throw error(400, 'Invalid episode order format');
		}
		episodesDb.updateDisplayOrder(id, displayOrder);
	}

	return json({ success: true });
};
