import { error } from '@sveltejs/kit';
import { mediaDb } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const media = mediaDb.get(params.id, locals.user.id);
	if (!media) {
		throw error(404, 'Media not found');
	}

	return { media };
};
