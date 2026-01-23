/**
 * Browse API - Phase 1: Discovery
 *
 * Returns trending/popular movies from TMDB with cached magnet links
 * where available.
 */

import { error, json } from '@sveltejs/kit';
import { type BrowseItem, getBrowseItemDetails, getPopular, getTrending } from '$lib/server/tmdb';
import { getCachedTorrents } from '$lib/server/torrent-cache';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	// Auth check
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const type = url.searchParams.get('type') || 'trending';
	const filter = (url.searchParams.get('filter') as 'all' | 'movie' | 'tv') || 'all';
	const page = Number.parseInt(url.searchParams.get('page') || '1', 10);

	let result: { items: BrowseItem[]; totalPages: number };

	switch (type) {
		case 'trending':
			result = await getTrending('day', page, filter);
			break;
		case 'popular':
			result = await getPopular(page, filter === 'all' ? 'movie' : filter);
			break;
		default:
			throw error(400, 'Invalid type. Use "trending" or "popular"');
	}

	// Get IMDB IDs and certifications for all items
	const itemsWithDetails = await Promise.all(
		result.items.map(async (item) => {
			if (!(item.imdbId && item.certification)) {
				const details = await getBrowseItemDetails(item.tmdbId, item.mediaType);
				return {
					...item,
					imdbId: item.imdbId || details.imdbId,
					certification: item.certification || details.certification,
				};
			}
			return item;
		})
	);

	// Check cache for magnet links
	const imdbIds = itemsWithDetails.filter((item) => item.imdbId).map((item) => item.imdbId as string);

	const cachedTorrents = await getCachedTorrents(imdbIds);

	// Attach cached magnet links
	const enrichedItems = itemsWithDetails.map((item) => {
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

	return json({
		items: enrichedItems,
		page,
		totalPages: result.totalPages,
	});
};
