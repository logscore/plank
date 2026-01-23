import { error } from '@sveltejs/kit';
import { config } from '$lib/config';
import { type BrowseItem, getBrowseItemDetails, getPopular, getTrending } from '$lib/server/tmdb';
import { getCachedTorrents } from '$lib/server/torrent-cache';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	// Check Jackett configuration
	const jackettConfigured = !!config.jackett.apiKey;
	let jackettStatus = 'not_configured';
	let hasIndexers = false;

	if (jackettConfigured) {
		try {
			// Test Jackett connectivity with a limited movie search
			// Use a popular movie IMDB ID to test if indexers are working
			const testResponse = await fetch(
				`${config.jackett.url}/api/v2.0/indexers/all/results?apikey=${config.jackett.apiKey}&Query=tt0080684&Limit=1`,
				{
					headers: { Accept: 'application/json' },
					signal: AbortSignal.timeout(10_000), // 10 second timeout for search
				}
			);

			if (testResponse.ok) {
				const response = await testResponse.json();

				// If we get any Results, it means at least one indexer is configured and working
				hasIndexers = response.Results && Array.isArray(response.Results) && response.Results.length > 0;
				jackettStatus = hasIndexers ? 'configured' : 'no_indexers';
			} else {
				jackettStatus = 'connection_failed';
			}
		} catch {
			jackettStatus = 'connection_failed';
		}
	}

	// If Jackett is not properly configured, return setup state
	if (!jackettConfigured || jackettStatus === 'no_indexers') {
		return {
			items: [],
			page: 1,
			totalPages: 0,
			type: 'trending',
			filter: 'all',
			jackettConfigured,
			jackettStatus,
			hasIndexers,
			needsSetup: true,
		};
	}

	const type = (url.searchParams.get('type') as 'trending' | 'popular') || 'trending';
	const filter = (url.searchParams.get('filter') as 'all' | 'movie' | 'tv') || 'all';
	const page = Number.parseInt(url.searchParams.get('page') || '1', 10);

	let result: { items: BrowseItem[]; totalPages: number };

	switch (type) {
		case 'trending':
			result = await getTrending('day', page, filter);
			break;
		case 'popular':
			// TMDB popular endpoint separates movie/tv, no "all" mixed endpoint
			// If all is selected, we default to movie for popularity or force one.
			// Let's default to movie if 'all', passing it as 'movie' to getPopular.
			result = await getPopular(page, filter === 'all' ? 'movie' : filter);
			break;
		default:
			throw error(400, 'Invalid type');
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

	return {
		items: enrichedItems,
		page,
		totalPages: result.totalPages,
		type,
		filter,
		jackettConfigured,
		jackettStatus,
		hasIndexers,
		needsSetup: false,
	};
};
