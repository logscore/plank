import { error } from '@sveltejs/kit';
import { movies } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const movie = movies.get(params.id, locals.user.id);
	if (!movie) {
		throw error(404, 'Movie not found');
	}

	return { movie };
};
