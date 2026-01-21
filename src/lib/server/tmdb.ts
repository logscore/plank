import { config } from '$lib/config';

interface TMDBGenre {
	id: number;
	name: string;
}

interface TMDBMovie {
	id: number;
	title: string;
	release_date: string;
	poster_path: string | null;
	backdrop_path: string | null;
	overview: string;
	vote_average?: number;
	runtime?: number;
	genres?: TMDBGenre[];
	tagline?: string;
	original_language?: string;
}

interface TMDBSearchResult {
	results: TMDBMovie[];
}

export interface TMDBMetadata {
	tmdbId: number | null;
	title: string;
	year: number | null;
	posterUrl: string | null;
	backdropUrl: string | null;
	overview: string | null;
	runtime?: number | null;
	genres?: string | null;
	originalLanguage?: string | null;
	certification?: string | null;
}

export async function searchMovie(query: string, year?: number | null): Promise<TMDBMetadata[]> {
	const params = new URLSearchParams({
		api_key: config.tmdb.apiKey,
		query,
	});

	if (year) {
		params.set('year', String(year));
	}

	const res = await fetch(`${config.tmdb.baseUrl}/search/movie?${params}`);

	if (!res.ok) {
		console.error(`[TMDB] Search failed with status ${res.status}: ${res.statusText}`);
		return [];
	}

	const data: TMDBSearchResult = await res.json();

	if (!(data.results && Array.isArray(data.results))) {
		console.error('[TMDB] Invalid response - no results array:', data);
		return [];
	}

	return data.results.map((movie) => ({
		tmdbId: movie.id,
		title: movie.title,
		year: movie.release_date ? Number.parseInt(movie.release_date.slice(0, 4), 10) : null,
		posterUrl: movie.poster_path ? `${config.tmdb.imageBaseUrl}${movie.poster_path}` : null,
		backdropUrl: movie.backdrop_path ? `${config.tmdb.imageBaseUrl}${movie.backdrop_path}` : null,
		overview: movie.overview ?? null,
	}));
}

interface TMDBReleaseDates {
	results: Array<{
		iso_3166_1: string;
		release_dates: Array<{
			certification: string;
			type: number;
		}>;
	}>;
}

export async function getMovieDetails(tmdbId: number): Promise<TMDBMetadata> {
	// Fetch movie details
	const res = await fetch(`${config.tmdb.baseUrl}/movie/${tmdbId}?api_key=${config.tmdb.apiKey}`);

	if (!res.ok) {
		console.error(`[TMDB] Failed to fetch movie details for ${tmdbId}: ${res.status}`);
		throw new Error(`TMDB API error: ${res.status}`);
	}

	const movie: TMDBMovie = await res.json();

	if (!movie?.id) {
		console.error(`[TMDB] Invalid movie response for ${tmdbId}:`, movie);
		throw new Error('Invalid TMDB response');
	}

	// Fetch US certification from release_dates
	let certification: string | null = null;
	try {
		const certRes = await fetch(
			`${config.tmdb.baseUrl}/movie/${tmdbId}/release_dates?api_key=${config.tmdb.apiKey}`
		);
		if (certRes.ok) {
			const certData: TMDBReleaseDates = await certRes.json();
			const usRelease = certData.results?.find((r) => r.iso_3166_1 === 'US');
			if (usRelease) {
				// Prefer theatrical release (type 3), then any with certification
				const theatrical = usRelease.release_dates.find((r) => r.type === 3 && r.certification);
				const anyCert = usRelease.release_dates.find((r) => r.certification);
				certification = theatrical?.certification || anyCert?.certification || null;
			}
		}
	} catch (e) {
		console.error(`[TMDB] Failed to fetch certification for ${tmdbId}:`, e);
	}

	return {
		tmdbId: movie.id,
		title: movie.title,
		year: movie.release_date ? Number.parseInt(movie.release_date.slice(0, 4), 10) : null,
		posterUrl: movie.poster_path ? `${config.tmdb.imageBaseUrl}${movie.poster_path}` : null,
		backdropUrl: movie.backdrop_path ? `${config.tmdb.imageBaseUrl}${movie.backdrop_path}` : null,
		overview: movie.overview ?? null,
		runtime: movie.runtime ?? null,
		genres: movie.genres ? JSON.stringify(movie.genres.map((g) => g.name)) : null,
		originalLanguage: movie.original_language ?? null,
		certification,
	};
}

// Alias for backwards compatibility
export const getMovieById = getMovieDetails;

import { imageStorage } from '$lib/server/storage';

export async function saveTmdbImages(
	metadata: TMDBMetadata,
	category: string,
	id: string
): Promise<{ posterUrl: string | null; backdropUrl: string | null }> {
	const result = {
		posterUrl: metadata.posterUrl,
		backdropUrl: metadata.backdropUrl,
	};

	if (metadata.posterUrl) {
		try {
			const storedPath = await imageStorage.saveFromUrl(
				category,
				id,
				'poster.jpg',
				metadata.posterUrl
			);
			result.posterUrl = `/images/${storedPath}`;
		} catch (e) {
			console.error(`Failed to save poster for ${id}:`, e);
		}
	}

	if (metadata.backdropUrl) {
		try {
			const storedPath = await imageStorage.saveFromUrl(
				category,
				id,
				'backdrop.jpg',
				metadata.backdropUrl
			);
			result.backdropUrl = `/images/${storedPath}`;
		} catch (e) {
			console.error(`Failed to save backdrop for ${id}:`, e);
		}
	}

	return result;
}
