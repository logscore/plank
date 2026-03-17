import { createQuery } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/query-keys';
import type { BrowseItem, SeasonSummary } from '$lib/server/tmdb';
import { createFetchError } from './fetch-error';

export type { BrowseItem, SeasonSummary } from '$lib/server/tmdb';

export interface BrowseResponse {
	items: BrowseItem[];
	page: number;
	totalPages: number;
}

export interface ProwlarrStatus {
	configured: boolean;
	url: string;
	connectionStatus: string;
	indexerCount: number;
	indexers: unknown[];
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

// =============================================================================
// Lazy Detail Enrichment
// =============================================================================

export interface BrowseDetailItem {
	tmdbId: number;
	imdbId: string | null;
	certification: string | null;
	magnetLink?: string;
}

export interface BrowseDetailsResponse {
	details: BrowseDetailItem[];
}

/**
 * Fetch IMDB IDs, certifications, and cached magnet links for a batch of items.
 * Called lazily after browse/search items render.
 */
export async function fetchBrowseDetails(
	items: { tmdbId: number; mediaType: 'movie' | 'tv' }[]
): Promise<BrowseDetailsResponse> {
	if (items.length === 0) {
		return { details: [] };
	}

	const response = await fetch('/api/browse/details', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ items }),
	});

	if (!response.ok) {
		throw createFetchError(`Failed to fetch browse details: ${response.statusText}`, response.status);
	}

	return response.json();
}

// =============================================================================
// Browse Content
// =============================================================================

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
 * Resolve torrent from IMDB/TMDB ID via Prowlarr
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
 * Fetch Prowlarr status
 */
export async function fetchProwlarrStatus(): Promise<ProwlarrStatus> {
	const response = await fetch('/api/prowlarr/status');

	if (!response.ok) {
		throw createFetchError(`Failed to fetch Prowlarr status: ${response.statusText}`, response.status);
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
 * Resolve season torrent from TMDB ID and season number via Prowlarr
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
