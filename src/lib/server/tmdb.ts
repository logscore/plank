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

interface TMDBSeason {
	air_date: string | null;
	episode_count: number;
	id: number;
	name: string;
	overview: string;
	poster_path: string | null;
	season_number: number;
	vote_average: number;
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
	seasons?: TMDBSeason[];
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

interface EpisodeMetadata {
	episodeNumber: number;
	title: string | null;
	overview: string | null;
	stillPath: string | null;
	runtime: number | null;
	airDate: string | null;
}

// Simplified season data for context menu
export interface SeasonSummary {
	seasonNumber: number;
	name: string;
	episodeCount: number;
	year?: number;
	posterPath?: string;
}

// =============================================================================
// Browse Item Type (for discovery)
// =============================================================================

export interface BrowseItem {
	tmdbId: number;
	imdbId: string | null;
	title: string;
	year: number | null;
	posterUrl: string | null;
	backdropUrl: string | null;
	overview: string | null;
	voteAverage: number | null;
	genres: string[];
	mediaType: 'movie' | 'tv';
	certification: string | null;
	// Set by the cache lookup
	magnetLink?: string;
	needsResolve: boolean;
}

// =============================================================================
// Trending & Popular Movies
// =============================================================================

interface TMDBTrendingItem {
	id: number;
	title?: string;
	name?: string;
	release_date?: string;
	first_air_date?: string;
	poster_path: string | null;
	backdrop_path: string | null;
	overview: string;
	vote_average: number;
	genre_ids: number[];
	media_type?: 'movie' | 'tv';
}

interface TMDBTrendingResponse {
	results: TMDBTrendingItem[];
	page: number;
	total_pages: number;
}

// Genre ID to name mapping for movies
const MOVIE_GENRES: Record<number, string> = {
	28: 'Action',
	12: 'Adventure',
	16: 'Animation',
	35: 'Comedy',
	80: 'Crime',
	99: 'Documentary',
	18: 'Drama',
	10751: 'Family',
	14: 'Fantasy',
	36: 'History',
	27: 'Horror',
	10402: 'Music',
	9648: 'Mystery',
	10749: 'Romance',
	878: 'Science Fiction',
	10770: 'TV Movie',
	53: 'Thriller',
	10752: 'War',
	37: 'Western',
};

const TV_GENRES: Record<number, string> = {
	10759: 'Action & Adventure',
	16: 'Animation',
	35: 'Comedy',
	80: 'Crime',
	99: 'Documentary',
	18: 'Drama',
	10751: 'Family',
	10762: 'Kids',
	9648: 'Mystery',
	10763: 'News',
	10764: 'Reality',
	10765: 'Sci-Fi & Fantasy',
	10766: 'Soap',
	10767: 'Talk',
	10768: 'War & Politics',
	37: 'Western',
};

function mapTmdbToBrowseItem(item: TMDBTrendingItem, defaultType: 'movie' | 'tv'): BrowseItem {
	const type = item.media_type || defaultType;
	const title = item.title || item.name || 'Unknown Title';
	const date = item.release_date || item.first_air_date;
	const year = date ? Number.parseInt(date.slice(0, 4), 10) : null;
	const genres = item.genre_ids.map((id) => (type === 'movie' ? MOVIE_GENRES[id] : TV_GENRES[id])).filter(Boolean);

	return {
		tmdbId: item.id,
		imdbId: null, // Will be fetched separately
		title,
		year,
		posterUrl: item.poster_path ? `${config.tmdb.imageBaseUrl}/w342${item.poster_path}` : null,
		backdropUrl: item.backdrop_path ? `${config.tmdb.imageBaseUrl}/w780${item.backdrop_path}` : null,
		overview: item.overview ?? null,
		voteAverage: item.vote_average ?? null,
		genres,
		mediaType: type,
		certification: null, // Will be fetched separately
		needsResolve: true,
	};
}

/**
 * Get trending content from TMDB
 */
export async function getTrending(
	timeWindow: 'day' | 'week' = 'day',
	page = 1,
	type: 'all' | 'movie' | 'tv' = 'all'
): Promise<{ items: BrowseItem[]; totalPages: number }> {
	const res = await fetch(
		`${config.tmdb.baseUrl}/trending/${type}/${timeWindow}?api_key=${config.tmdb.apiKey}&page=${page}`
	);

	if (!res.ok) {
		console.error(`[TMDB] Trending ${type} failed: ${res.status}`);
		return { items: [], totalPages: 0 };
	}

	const data: TMDBTrendingResponse = await res.json();

	// If type is 'all', TMDB returns media_type. If specific, it doesn't always, so default.
	const items: BrowseItem[] = data.results.map((item) => mapTmdbToBrowseItem(item, type === 'all' ? 'movie' : type));

	return { items, totalPages: data.total_pages };
}

/**
 * Get popular content from TMDB
 */
export async function getPopular(
	page = 1,
	type: 'movie' | 'tv' = 'movie'
): Promise<{ items: BrowseItem[]; totalPages: number }> {
	const res = await fetch(`${config.tmdb.baseUrl}/${type}/popular?api_key=${config.tmdb.apiKey}&page=${page}`);

	if (!res.ok) {
		console.error(`[TMDB] Popular ${type} failed: ${res.status}`);
		return { items: [], totalPages: 0 };
	}

	const data: TMDBTrendingResponse = await res.json();

	const items: BrowseItem[] = data.results.map((item) => mapTmdbToBrowseItem(item, type));

	return { items, totalPages: data.total_pages };
}

/**
 * Get cached item details (IMDB ID + Certification)
 */
export async function getBrowseItemDetails(
	tmdbId: number,
	type: 'movie' | 'tv'
): Promise<{ imdbId: string | null; certification: string | null }> {
	// For movies: append_to_response=external_ids,release_dates
	// For tv: append_to_response=external_ids,content_ratings
	const append = type === 'movie' ? 'external_ids,release_dates' : 'external_ids,content_ratings';

	// Cache key could be implemented here if needed to avoid spamming TMDB
	const res = await fetch(
		`${config.tmdb.baseUrl}/${type}/${tmdbId}?api_key=${config.tmdb.apiKey}&append_to_response=${append}`
	);

	if (!res.ok) {
		return { imdbId: null, certification: null };
	}

	const data = await res.json();
	const imdbId = data.external_ids?.imdb_id ?? null;
	let certification: string | null = null;

	if (type === 'movie' && data.release_dates?.results) {
		const usRelease = data.release_dates.results.find((r: { iso_3166_1: string }) => r.iso_3166_1 === 'US');
		if (usRelease) {
			const theatrical = usRelease.release_dates.find(
				(r: { type: number; certification: string }) => r.type === 3 && r.certification
			);
			const anyCert = usRelease.release_dates.find((r: { certification: string }) => r.certification);
			certification = theatrical?.certification || anyCert?.certification || null;
		}
	} else if (type === 'tv' && data.content_ratings?.results) {
		const usRating = data.content_ratings.results.find((r: { iso_3166_1: string }) => r.iso_3166_1 === 'US');
		certification = usRating?.rating || null;
	}

	return { imdbId, certification };
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
		posterUrl: movie.poster_path ? `${config.tmdb.imageBaseUrl}/w342${movie.poster_path}` : null,
		backdropUrl: movie.backdrop_path ? `${config.tmdb.imageBaseUrl}/w780${movie.backdrop_path}` : null,
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
		posterUrl: movie.poster_path ? `${config.tmdb.imageBaseUrl}/w342${movie.poster_path}` : null,
		backdropUrl: movie.backdrop_path ? `${config.tmdb.imageBaseUrl}/w780${movie.backdrop_path}` : null,
		overview: movie.overview ?? null,
		runtime: movie.runtime ?? null,
		genres: movie.genres ? JSON.stringify(movie.genres.map((g) => g.name)) : null,
		originalLanguage: movie.original_language ?? null,
		certification,
	};
}

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
		posterUrl: show.poster_path ? `${config.tmdb.imageBaseUrl}/w342${show.poster_path}` : null,
		backdropUrl: show.backdrop_path ? `${config.tmdb.imageBaseUrl}/w780${show.backdrop_path}` : null,
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

export async function getTVDetails(tmdbId: number): Promise<TMDBMetadata & { totalSeasons: number }> {
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
		posterUrl: show.poster_path ? `${config.tmdb.imageBaseUrl}/w342${show.poster_path}` : null,
		backdropUrl: show.backdrop_path ? `${config.tmdb.imageBaseUrl}/w780${show.backdrop_path}` : null,
		overview: show.overview ?? null,
		totalSeasons: show.number_of_seasons ?? 0,
		runtime: show.episode_run_time?.[0] ?? null,
		genres: show.genres ? JSON.stringify(show.genres.map((g) => g.name)) : null,
		originalLanguage: show.original_language ?? null,
		certification,
	};
}

/**
 * Get all seasons summary for a TV show (for context menu)
 * Excludes specials (season 0) by default
 */
export async function getTVSeasons(tmdbId: number, includeSpecials = false): Promise<SeasonSummary[]> {
	const res = await fetch(`${config.tmdb.baseUrl}/tv/${tmdbId}?api_key=${config.tmdb.apiKey}`);

	if (!res.ok) {
		console.error(`[TMDB] Failed to fetch TV seasons for ${tmdbId}: ${res.status}`);
		throw new Error(`TMDB API error: ${res.status}`);
	}

	const show: TMDBTVShow = await res.json();

	if (!show?.seasons) {
		return [];
	}

	return show.seasons
		.filter((season) => includeSpecials || season.season_number > 0)
		.map((season) => ({
			seasonNumber: season.season_number,
			name: season.name || `Season ${season.season_number}`,
			episodeCount: season.episode_count,
			year: season.air_date ? Number.parseInt(season.air_date.slice(0, 4), 10) : undefined,
			posterPath: season.poster_path ? `${config.tmdb.imageBaseUrl}/w154${season.poster_path}` : undefined,
		}));
}

export async function getSeasonDetails(tmdbId: number, seasonNumber: number): Promise<SeasonMetadata> {
	const res = await fetch(`${config.tmdb.baseUrl}/tv/${tmdbId}/season/${seasonNumber}?api_key=${config.tmdb.apiKey}`);

	if (!res.ok) {
		console.error(`[TMDB] Failed to fetch season ${seasonNumber} for TV ${tmdbId}: ${res.status}`);
		throw new Error(`TMDB API error: ${res.status}`);
	}

	const season: TMDBSeasonDetail = await res.json();

	return {
		seasonNumber: season.season_number,
		name: season.name ?? null,
		overview: season.overview ?? null,
		posterPath: season.poster_path ? `${config.tmdb.imageBaseUrl}/w342${season.poster_path}` : null,
		airDate: season.air_date ?? null,
		episodeCount: season.episodes?.length ?? 0,
		episodes:
			season.episodes?.map((ep) => ({
				episodeNumber: ep.episode_number,
				title: ep.name ?? null,
				overview: ep.overview ?? null,
				stillPath: ep.still_path ? `${config.tmdb.imageBaseUrl}/w300${ep.still_path}` : null,
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
	// Standard S01E01 format (most common)
	/S\d{1,2}E\d{1,3}/i,
	/S\d{1,2}\s?E\d{1,3}/i,

	// 1x01 format
	/\d{1,2}x\d{1,3}/i,

	// Anime / Absolute Numbering (e.g. " - 05", " - 124", " - 01v2")
	// Watch out for years (2024), so we check for surrounding spaces or brackets
	/\s-\s\d{2,4}(?:v\d)?(?:\s|\[|\.\w{3}|$)/,
	/\[\d{2,4}\]/, // [01] or [124] often used in anime

	// Date based (e.g. 2024.01.24, 2024-01-24) - common for daily shows
	/\d{4}[.-]\d{2}[.-]\d{2}/,

	// "Season X" or "Series X"
	/(?:Season|Series)\s*\d+/i,

	// "Episode X"
	/Episode\s*\d+/i,

	// Standalone "E01" if clearer context (often risky, but keeping for coverage)
	/\bE\d{1,3}\b/i,

	// Mini-series / Multi-part
	/Part\s*\d+/i,

	// Keyword "Complete" often implies a season pack
	/Complete\s*(?:Season|Series)/i,

	// Range formats (S01-S03)
	/S\d{1,2}-S\d{1,2}/i,

	// Standalone "S01" (Season packs)
	/\bS\d{1,2}\b/i,

	// Year ranges (2019-2022) often imply a show run
	/\(\d{4}\)\s?-\s?\(\d{4}\)/,
];

/**
 * Detect if filename looks like a TV show
 */
export function isTVShowFilename(title: string): boolean {
	return TV_PATTERNS.some((pattern) => pattern.test(title));
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
			const storedPath = await imageStorage.saveFromUrl(category, id, 'poster.jpg', metadata.posterUrl);
			result.posterUrl = `/images/${storedPath}`;
		} catch (e) {
			console.error(`Failed to save poster for ${id}:`, e);
		}
	}

	if (metadata.backdropUrl) {
		try {
			const storedPath = await imageStorage.saveFromUrl(category, id, 'backdrop.jpg', metadata.backdropUrl);
			result.backdropUrl = `/images/${storedPath}`;
		} catch (e) {
			console.error(`Failed to save backdrop for ${id}:`, e);
		}
	}

	return result;
}
