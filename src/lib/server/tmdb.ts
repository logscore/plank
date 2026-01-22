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

interface TMDBTVShow {
	id: number;
	name: string;
	first_air_date: string;
	poster_path: string | null;
	backdrop_path: string | null;
	overview: string;
	vote_average?: number;
	number_of_seasons?: number;
	episode_run_time?: number[];
	genres?: TMDBGenre[];
	original_language?: string;
}

interface TMDBSearchResult {
	results: TMDBMovie[];
}

interface TMDBTVSearchResult {
	results: TMDBTVShow[];
}

interface TMDBEpisode {
	episode_number: number;
	name: string;
	overview: string;
	still_path: string | null;
	runtime: number | null;
	air_date: string;
}

interface TMDBSeasonDetail {
	season_number: number;
	name: string;
	overview: string;
	poster_path: string | null;
	air_date: string;
	episodes: TMDBEpisode[];
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
	totalSeasons?: number | null;
}

export interface SeasonMetadata {
	seasonNumber: number;
	name: string | null;
	overview: string | null;
	posterPath: string | null;
	airDate: string | null;
	episodeCount: number;
	episodes: EpisodeMetadata[];
}

export interface EpisodeMetadata {
	episodeNumber: number;
	title: string | null;
	overview: string | null;
	stillPath: string | null;
	runtime: number | null;
	airDate: string | null;
}

// =============================================================================
// Movie Search & Details
// =============================================================================

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

// =============================================================================
// TV Show Search & Details
// =============================================================================

export async function searchTVShow(query: string, year?: number | null): Promise<TMDBMetadata[]> {
	const params = new URLSearchParams({
		api_key: config.tmdb.apiKey,
		query,
	});

	if (year) {
		params.set('first_air_date_year', String(year));
	}

	const res = await fetch(`${config.tmdb.baseUrl}/search/tv?${params}`);

	if (!res.ok) {
		console.error(`[TMDB] TV search failed with status ${res.status}: ${res.statusText}`);
		return [];
	}

	const data: TMDBTVSearchResult = await res.json();

	if (!(data.results && Array.isArray(data.results))) {
		console.error('[TMDB] Invalid TV response - no results array:', data);
		return [];
	}

	return data.results.map((show) => ({
		tmdbId: show.id,
		title: show.name,
		year: show.first_air_date ? Number.parseInt(show.first_air_date.slice(0, 4), 10) : null,
		posterUrl: show.poster_path ? `${config.tmdb.imageBaseUrl}${show.poster_path}` : null,
		backdropUrl: show.backdrop_path ? `${config.tmdb.imageBaseUrl}${show.backdrop_path}` : null,
		overview: show.overview ?? null,
		totalSeasons: show.number_of_seasons ?? null,
	}));
}

interface TMDBContentRatings {
	results: Array<{
		iso_3166_1: string;
		rating: string;
	}>;
}

export async function getTVDetails(
	tmdbId: number
): Promise<TMDBMetadata & { totalSeasons: number }> {
	const res = await fetch(`${config.tmdb.baseUrl}/tv/${tmdbId}?api_key=${config.tmdb.apiKey}`);

	if (!res.ok) {
		console.error(`[TMDB] Failed to fetch TV details for ${tmdbId}: ${res.status}`);
		throw new Error(`TMDB API error: ${res.status}`);
	}

	const show: TMDBTVShow = await res.json();

	if (!show?.id) {
		console.error(`[TMDB] Invalid TV response for ${tmdbId}:`, show);
		throw new Error('Invalid TMDB response');
	}

	// Fetch US certification from content_ratings
	let certification: string | null = null;
	try {
		const certRes = await fetch(
			`${config.tmdb.baseUrl}/tv/${tmdbId}/content_ratings?api_key=${config.tmdb.apiKey}`
		);
		if (certRes.ok) {
			const certData: TMDBContentRatings = await certRes.json();
			const usRating = certData.results?.find((r) => r.iso_3166_1 === 'US');
			certification = usRating?.rating || null;
		}
	} catch (e) {
		console.error(`[TMDB] Failed to fetch TV certification for ${tmdbId}:`, e);
	}

	return {
		tmdbId: show.id,
		title: show.name,
		year: show.first_air_date ? Number.parseInt(show.first_air_date.slice(0, 4), 10) : null,
		posterUrl: show.poster_path ? `${config.tmdb.imageBaseUrl}${show.poster_path}` : null,
		backdropUrl: show.backdrop_path ? `${config.tmdb.imageBaseUrl}${show.backdrop_path}` : null,
		overview: show.overview ?? null,
		totalSeasons: show.number_of_seasons ?? 0,
		runtime: show.episode_run_time?.[0] ?? null,
		genres: show.genres ? JSON.stringify(show.genres.map((g) => g.name)) : null,
		originalLanguage: show.original_language ?? null,
		certification,
	};
}

export async function getSeasonDetails(
	tmdbId: number,
	seasonNumber: number
): Promise<SeasonMetadata> {
	const res = await fetch(
		`${config.tmdb.baseUrl}/tv/${tmdbId}/season/${seasonNumber}?api_key=${config.tmdb.apiKey}`
	);

	if (!res.ok) {
		console.error(`[TMDB] Failed to fetch season ${seasonNumber} for TV ${tmdbId}: ${res.status}`);
		throw new Error(`TMDB API error: ${res.status}`);
	}

	const season: TMDBSeasonDetail = await res.json();

	return {
		seasonNumber: season.season_number,
		name: season.name ?? null,
		overview: season.overview ?? null,
		posterPath: season.poster_path ? `${config.tmdb.imageBaseUrl}${season.poster_path}` : null,
		airDate: season.air_date ?? null,
		episodeCount: season.episodes?.length ?? 0,
		episodes:
			season.episodes?.map((ep) => ({
				episodeNumber: ep.episode_number,
				title: ep.name ?? null,
				overview: ep.overview ?? null,
				stillPath: ep.still_path ? `${config.tmdb.imageBaseUrl}${ep.still_path}` : null,
				runtime: ep.runtime ?? null,
				airDate: ep.air_date ?? null,
			})) ?? [],
	};
}

// =============================================================================
// TV Show Detection
// =============================================================================

// Common patterns that indicate a TV show in filenames
const TV_PATTERNS = [
	/S\d{1,2}E\d{1,2}/i, // S01E01
	/\d{1,2}x\d{1,2}/i, // 1x01
	/Season\s*\d+/i, // Season 1
	/Episode\s*\d+/i, // Episode 1
	/E\d{2,}/i, // E01
	/\[\d{1,2}(?:v\d)?\]/, // [01] or [01v2]
	/Complete\s*Series/i, // Complete Series
	/Series\s*\d+/i, // Series 1
	/\bS\d{1,2}\b/i, // S01 standalone
	/\.\d{1,2}\.\d{1,2}\./i, // .1.01.
	/\(\d{4}\).*\(\d{4}\)/i, // Year range like (2019) - (2022)
];

/**
 * Detect if filename looks like a TV show
 */
export function isTVShowFilename(title: string): boolean {
	return TV_PATTERNS.some((pattern) => pattern.test(title));
}

// Regex patterns for episode parsing (at top level for performance)
const SXXEXX_PATTERN = /S(\d{1,2})E(\d{1,2})/i;
const NXNN_PATTERN = /(\d{1,2})x(\d{1,2})/i;
const SXX_PATTERN = /\bS(\d{1,2})\b/i;
const SXXEXX_CHECK_PATTERN = /S\d{1,2}E\d{1,2}/i;

/**
 * Parse season and episode numbers from a filename
 */
export function parseEpisodeInfo(
	filename: string
): { season: number; episode: number } | { season: number } | null {
	// S01E01 pattern
	const sxxexx = filename.match(SXXEXX_PATTERN);
	if (sxxexx) {
		return { season: Number.parseInt(sxxexx[1], 10), episode: Number.parseInt(sxxexx[2], 10) };
	}

	// 1x01 pattern
	const nxnn = filename.match(NXNN_PATTERN);
	if (nxnn) {
		return { season: Number.parseInt(nxnn[1], 10), episode: Number.parseInt(nxnn[2], 10) };
	}

	// Season pack pattern (S01 without episode)
	const sxx = filename.match(SXX_PATTERN);
	if (sxx && !filename.match(SXXEXX_CHECK_PATTERN)) {
		return { season: Number.parseInt(sxx[1], 10) };
	}

	return null;
}

// =============================================================================
// Image Storage
// =============================================================================

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
