import { error, json } from '@sveltejs/kit';
import { searchMovie, searchTVShow } from '$lib/server/tmdb';
import type { MediaType } from '$lib/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const query = url.searchParams.get('q');
	const type = url.searchParams.get('type') as MediaType | null;
	const yearParam = url.searchParams.get('year');
	const year = yearParam ? Number.parseInt(yearParam, 10) : undefined;

	if (!query || query.length < 2) {
		throw error(400, 'Query too short');
	}

	interface SearchResult {
		tmdbId: number | null;
		title: string;
		year: number | null;
		posterUrl: string | null;
		backdropUrl: string | null;
		overview: string | null;
		type: MediaType;
		totalSeasons?: number | null;
	}

	let results: SearchResult[];
	if (type === 'tv') {
		results = (await searchTVShow(query, year)).map((r) => ({ ...r, type: 'tv' as const }));
	} else if (type === 'movie') {
		results = (await searchMovie(query, year)).map((r) => ({ ...r, type: 'movie' as const }));
	} else {
		// Search both
		const [movies, shows] = await Promise.all([searchMovie(query, year), searchTVShow(query, year)]);
		results = [
			...movies.map((m) => ({ ...m, type: 'movie' as const })),
			...shows.map((s) => ({ ...s, type: 'tv' as const })),
		];
	}

	return json(results);
};
