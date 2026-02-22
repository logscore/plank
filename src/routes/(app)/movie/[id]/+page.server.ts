import { error } from '@sveltejs/kit';
import { mediaDb } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		throw error(400, 'No active profile selected');
	}

	const media = mediaDb.get(params.id, organizationId);
	if (!media) {
		throw error(404, 'Media not found');
	}

	return { media };
};
