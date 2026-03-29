import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const type = (url.searchParams.get('type') as 'trending' | 'popular') || 'trending';
	const filter = (url.searchParams.get('filter') as 'all' | 'movie' | 'show') || 'all';

	return { type, filter };
};
