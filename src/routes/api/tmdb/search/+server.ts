/**
 * TMDB Search API - Search movies and shows
 */

import { error, json } from '@sveltejs/kit';
import type { BrowseItem } from '$lib/server/tmdb';
import { getBrowseItemDetails, searchMovie, searchTVShow } from '$lib/server/tmdb';
import { getCachedTorrents } from '$lib/server/torrent-cache';
import type { RequestHandler } from './$types';

interface SearchResponse {
	results: BrowseItem[];
	total: number;
	page: number;
	totalPages: number;
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const query = url.searchParams.get('q')?.trim() || '';
	const type = (url.searchParams.get('type') as 'all' | 'movie' | 'tv') || 'all';
	const page = Number.parseInt(url.searchParams.get('page') || '1', 10);

	if (query.length < 2) {
		return json({ results: [], total: 0, page: 1, totalPages: 0 });
	}

	try {
		const searchPromises: Promise<BrowseItem[]>[] = [];

		// Search movies and TV shows based on type filter
		if (type === 'all' || type === 'movie') {
			searchPromises.push(
				searchMovie(query).then((movies) =>
					movies
						.filter((movie) => movie.tmdbId !== null)
						.map((movie): BrowseItem => {
							if (!movie.tmdbId) {
								throw new Error('Movie tmdbId is null');
							}
							return {
								tmdbId: movie.tmdbId,
								imdbId: null,
								title: movie.title,
								year: movie.year,
								posterUrl: movie.posterUrl,
								backdropUrl: movie.backdropUrl,
								overview: movie.overview,
								voteAverage: null,
								genres: [],
								mediaType: 'movie' as const,
								certification: null,
								needsResolve: true,
							};
						})
				)
			);
		}

		if (type === 'all' || type === 'tv') {
			searchPromises.push(
				searchTVShow(query).then((shows) =>
					shows
						.filter((show) => show.tmdbId !== null)
						.map((show): BrowseItem => {
							if (!show.tmdbId) {
								throw new Error('Show tmdbId is null');
							}
							return {
								tmdbId: show.tmdbId,
								imdbId: null,
								title: show.title,
								year: show.year,
								posterUrl: show.posterUrl,
								backdropUrl: show.backdropUrl,
								overview: show.overview,
								voteAverage: null,
								genres: [],
								mediaType: 'tv' as const,
								certification: null,
								needsResolve: true,
							};
						})
				)
			);
		}

		const results = await Promise.all(searchPromises);
		const allResults = results.flat();

		// Sort by relevance (simple title matching for now)
		const sortedResults = allResults.sort((a, b) => {
			const aLower = a.title.toLowerCase();
			const bLower = b.title.toLowerCase();
			const queryLower = query.toLowerCase();

			const aIsExact = aLower === queryLower;
			const bIsExact = bLower === queryLower;
			const aStarts = aLower.startsWith(queryLower);
			const bStarts = bLower.startsWith(queryLower);

			let aExactMatch = 0;
			let bExactMatch = 0;

			if (aIsExact) {
				aExactMatch = 2;
			} else if (aStarts) {
				aExactMatch = 1;
			}

			if (bIsExact) {
				bExactMatch = 2;
			} else if (bStarts) {
				bExactMatch = 1;
			}

			return bExactMatch - aExactMatch;
		});

		// Paginate results (20 per page)
		const startIndex = (page - 1) * 20;
		const endIndex = startIndex + 20;
		const paginatedResults = sortedResults.slice(startIndex, endIndex);

		// Get additional details (IMDB ID, certification) for paginated results
		const itemsWithDetails = await Promise.all(
			paginatedResults.map(async (item) => {
				const details = await getBrowseItemDetails(item.tmdbId, item.mediaType);
				return {
					...item,
					imdbId: details.imdbId,
					certification: details.certification,
					genres: item.genres || [], // Ensure genres is always an array
				};
			})
		);

		// Check cache for magnet links
		const imdbIds = itemsWithDetails.filter((item) => item.imdbId).map((item) => item.imdbId as string);

		const cachedTorrents = await getCachedTorrents(imdbIds);

		// Attach cached magnet links
		const enrichedResults = itemsWithDetails.map((item) => {
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

		const response: SearchResponse = {
			results: enrichedResults,
			total: sortedResults.length,
			page,
			totalPages: Math.ceil(sortedResults.length / 20),
		};

		return json(response);
	} catch (err) {
		console.error('Search error:', err);
		throw error(500, 'Internal server error');
	}
};
