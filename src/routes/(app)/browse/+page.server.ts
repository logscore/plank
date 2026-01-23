import { error } from '@sveltejs/kit';
import {
	type BrowseItem,
	getMovieExternalIds,
	getPopularMovies,
	getTrendingMovies,
} from '$lib/server/tmdb';
import { getCachedTorrents } from '$lib/server/torrent-cache';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const type = (url.searchParams.get('type') as 'trending' | 'popular') || 'trending';
	const page = Number.parseInt(url.searchParams.get('page') || '1', 10);

	let result: { items: BrowseItem[]; totalPages: number };

	switch (type) {
		case 'trending':
			result = await getTrendingMovies('day', page);
			break;
		case 'popular':
			result = await getPopularMovies(page);
			break;
		default:
			throw error(400, 'Invalid type. Use "trending" or "popular"');
	}

	// Get IMDB IDs for all items (needed for cache lookup and torrent resolution)
	const itemsWithImdb = await Promise.all(
		result.items.map(async (item) => {
			if (!item.imdbId) {
				const external = await getMovieExternalIds(item.tmdbId);
				return { ...item, imdbId: external.imdbId };
			}
			return item;
		})
	);

	// Check cache for magnet links
	const imdbIds = itemsWithImdb
		.filter((item) => item.imdbId)
		.map((item) => item.imdbId as string);

	const cachedTorrents = await getCachedTorrents(imdbIds);

	// Attach cached magnet links
	const enrichedItems = itemsWithImdb.map((item) => {
		if (item.imdbId && cachedTorrents.has(item.imdbId)) {
			const cached = cachedTorrents.get(item.imdbId);
			return {
				...item,
				magnetLink: cached?.magnetLink,
				needsResolve: false,
			};
		}
		return item;
	});

	return {
		items: enrichedItems,
		page,
		totalPages: result.totalPages,
		type,
	};
};
