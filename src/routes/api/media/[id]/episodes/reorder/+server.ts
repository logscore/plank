import { error, json } from '@sveltejs/kit';
import { mediaDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}
	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		throw error(400, 'No active profile selected');
	}
	const mediaItem = mediaDb.get(params.id, organizationId);
	if (!mediaItem) {
		throw error(404, 'Media not found');
	}
	if (mediaItem.type !== 'show') {
		throw error(400, 'Not a show');
	}
	const { episodeOrders } = (await request.json()) as {
		episodeOrders: Array<{ id: string; displayOrder: number }>;
	};
	if (!Array.isArray(episodeOrders)) {
		throw error(400, 'Invalid episode orders');
	}
	for (const item of episodeOrders) {
		if (typeof item.id !== 'string' || typeof item.displayOrder !== 'number') {
			throw error(400, 'Invalid episode order format');
		}
	}
	mediaDb.bulkUpdateDisplayOrder(episodeOrders);
	return json({ success: true });
};
