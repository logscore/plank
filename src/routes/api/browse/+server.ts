/**
 * Browse API - Discovery
 *
 * Returns trending/popular movies from TMDB immediately.
 * Detail enrichment (IMDB IDs, certifications, cached magnets)
 * is handled lazily via /api/browse/details.
 */

import { error, json } from '@sveltejs/kit';
import { getPopular, getTrending } from '$lib/server/tmdb';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const type = url.searchParams.get('type') || 'trending';
	const filter = (url.searchParams.get('filter') as 'all' | 'movie' | 'tv') || 'all';
	const page = Number.parseInt(url.searchParams.get('page') || '1', 10);

	switch (type) {
		case 'trending': {
			const result = await getTrending('day', page, filter);
			return json({ items: result.items, page, totalPages: result.totalPages });
		}
		case 'popular': {
			const result = await getPopular(page, filter === 'all' ? 'movie' : filter);
			return json({ items: result.items, page, totalPages: result.totalPages });
		}
		default:
			throw error(400, 'Invalid type. Use "trending" or "popular"');
	}
};
