import { createQuery } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/query-keys';
import type { FetchError } from './media-queries';

// BrowseItem type - matches the server-side type from tmdb.ts
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
	magnetLink?: string;
	needsResolve: boolean;
}

export interface BrowseResponse {
	items: BrowseItem[];
	page: number;
	totalPages: number;
}

export interface JackettStatus {
	jackettConfigured: boolean;
	jackettStatus: string;
	hasIndexers: boolean;
	needsSetup: boolean;
}

export interface ResolveResponse {
	success: boolean;
	cached?: boolean;
	error?: string;
	message?: string;
	torrent?: {
		imdbId: string;
		tmdbId?: number;
		magnetLink: string;
		infohash: string;
		title: string;
		quality?: string;
		releaseGroup?: string;
		size?: number;
		seeders?: number;
	};
}

function createFetchError(message: string, status?: number): FetchError {
	const error = new Error(message) as FetchError;
	error.status = status;
	return error;
}

/**
 * Fetch trending content
 */
export async function fetchTrending(filter: 'all' | 'movie' | 'tv' = 'all', page = 1): Promise<BrowseResponse> {
	const params = new URLSearchParams({
		type: 'trending',
		filter,
		page: page.toString(),
	});

	const response = await fetch(`/api/browse?${params}`);

	if (!response.ok) {
		throw createFetchError(`Failed to fetch trending: ${response.statusText}`, response.status);
	}

	return response.json();
}

/**
 * Fetch browse content (trending or popular)
 */
export async function fetchBrowse(
	type: 'trending' | 'popular',
	filter: 'all' | 'movie' | 'tv' = 'all',
	page = 1
): Promise<BrowseResponse> {
	const params = new URLSearchParams({
		type,
		filter,
		page: page.toString(),
	});

	const response = await fetch(`/api/browse?${params}`);

	if (!response.ok) {
		throw createFetchError(`Failed to fetch ${type}: ${response.statusText}`, response.status);
	}

	return response.json();
}

/**
 * Resolve torrent from IMDB/TMDB ID via Jackett
 */
export async function resolveTorrent(item: {
	imdbId: string | null;
	tmdbId: number;
	title: string;
}): Promise<ResolveResponse> {
	const response = await fetch('/api/browse/resolve', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			imdbId: item.imdbId,
			tmdbId: item.tmdbId,
			title: item.title,
		}),
	});

	if (!response.ok) {
		throw createFetchError(`Failed to resolve torrent: ${response.statusText}`, response.status);
	}

	return response.json();
}

/**
 * Fetch Jackett status
 */
export async function fetchJackettStatus(): Promise<JackettStatus> {
	const response = await fetch('/api/jackett/status');

	if (!response.ok) {
		throw createFetchError(`Failed to fetch Jackett status: ${response.statusText}`, response.status);
	}

	return response.json();
}

/**
 * Search TMDB
 */
export async function searchTMDB(query: string): Promise<BrowseResponse> {
	if (query.length < 2) {
		return { items: [], page: 1, totalPages: 0 };
	}

	const response = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}`);

	if (!response.ok) {
		throw createFetchError(`Failed to search TMDB: ${response.statusText}`, response.status);
	}

	const data = await response.json();
	// Normalize response to match BrowseResponse structure
	return {
		items: data.results || [],
		page: data.page || 1,
		totalPages: data.total_pages || 1,
	};
}

// =============================================================================
// TV Seasons
// =============================================================================

export interface SeasonSummary {
	seasonNumber: number;
	name: string;
	episodeCount: number;
	year?: number;
	posterPath?: string;
}

export interface SeasonsResponse {
	seasons: SeasonSummary[];
}

export interface ResolveSeasonResponse {
	success: boolean;
	error?: string;
	message?: string;
	torrent?: {
		magnetLink: string;
		infohash: string;
		title: string;
		quality?: string;
		releaseGroup?: string;
		size?: number;
		seeders?: number;
	};
}

/**
 * Fetch seasons for a TV show
 */
export async function fetchSeasons(tmdbId: number): Promise<SeasonsResponse> {
	const response = await fetch(`/api/browse/seasons/${tmdbId}`);

	if (!response.ok) {
		throw createFetchError(`Failed to fetch seasons: ${response.statusText}`, response.status);
	}

	return response.json();
}

export function createSeasonsQuery(tmdbId: number, options?: { enabled?: boolean }) {
	return createQuery(() => ({
		queryKey: queryKeys.browse.seasons(tmdbId),
		queryFn: () => fetchSeasons(tmdbId),
		enabled: options?.enabled,
		staleTime: 1000 * 60 * 60, // 1 hour
	}));
}

/**
 * Resolve season torrent from TMDB ID and season number via Jackett
 */
export async function resolveSeasonTorrent(params: {
	tmdbId: number;
	seasonNumber: number;
	showTitle: string;
	imdbId?: string;
}): Promise<ResolveSeasonResponse> {
	const response = await fetch('/api/browse/resolve-season', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(params),
	});

	if (!response.ok) {
		throw createFetchError(`Failed to resolve season torrent: ${response.statusText}`, response.status);
	}

	return response.json();
}
