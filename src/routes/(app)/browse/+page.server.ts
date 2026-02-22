import { error } from '@sveltejs/kit';
import { config } from '$lib/config';
import { type BrowseItem, getBrowseItemDetails, getPopular, getTrending } from '$lib/server/tmdb';
import { getCachedTorrents } from '$lib/server/torrent-cache';
import type { PageServerLoad } from './$types';

async function fetchBrowseData(type: 'trending' | 'popular', filter: 'all' | 'movie' | 'tv', page: number) {
	let result: { items: BrowseItem[]; totalPages: number };

	switch (type) {
		case 'trending':
			result = await getTrending('day', page, filter);
			break;
		case 'popular':
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
	};
}

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const type = (url.searchParams.get('type') as 'trending' | 'popular') || 'trending';
	const filter = (url.searchParams.get('filter') as 'all' | 'movie' | 'tv') || 'all';
	const page = Number.parseInt(url.searchParams.get('page') || '1', 10);

	// Return synchronous metadata immediately, stream heavy data as promises.
	// This lets SvelteKit render the page shell instantly while data loads.
	return {
		type,
		filter,
		// Streamed: these resolve in the background while the page shows skeletons
		prowlarrCheck: checkProwlarrStatus(),
		browseData: fetchBrowseData(type, filter, page),
	};
};

async function checkProwlarrStatus() {
	const prowlarrConfigured = !!config.prowlarr.apiKey;
	let prowlarrStatus = 'not_configured';
	let hasIndexers = false;

	if (prowlarrConfigured) {
		try {
			// Test Prowlarr connectivity with a limited movie search
			// Use a popular movie IMDB ID to test if indexers are working
			const testResponse = await fetch(
				`${config.prowlarr.url}/api/v1/search?query=tt0080684&type=search&apikey=${config.prowlarr.apiKey}`,
				{
					headers: { Accept: 'application/json' },
					signal: AbortSignal.timeout(10_000), // 10 second timeout for search
				}
			);

			if (testResponse.ok) {
				const response = await testResponse.json();

				// If we get an array, it's working. If it has items, indexers are finding things.
				if (Array.isArray(response)) {
					prowlarrStatus = 'configured';
					hasIndexers = response.length > 0;

					if (response.length === 0) {
						prowlarrStatus = 'no_indexers';
					}
				} else {
					prowlarrStatus = 'connection_failed';
				}
			} else {
				prowlarrStatus = 'connection_failed';
			}
		} catch {
			prowlarrStatus = 'connection_failed';
		}
	}

	return { prowlarrConfigured, prowlarrStatus, hasIndexers };
}
