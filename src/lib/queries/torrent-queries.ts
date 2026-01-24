import type { FetchError } from './media-queries';

export interface TorrentSearchParams {
	q?: string;
	category?: string;
	quality?: string;
	minSize?: number;
	maxSize?: number;
	minSeeders?: number;
	trustedGroups?: boolean;
	sort?: 'relevance' | 'size' | 'seeders' | 'date';
	order?: 'asc' | 'desc';
	page?: number;
	limit?: number;
}

export interface TorrentResult {
	title: string;
	magnetLink: string;
	infohash: string;
	size: number;
	seeders: number;
	leechers: number;
	uploadDate: string;
	category: string;
	quality?: string;
	releaseGroup?: string;
}

export interface TorrentSearchResponse {
	results: TorrentResult[];
	total: number;
	page: number;
	totalPages: number;
	hasNext: boolean;
	hasPrev: boolean;
}

function createFetchError(message: string, status?: number): FetchError {
	const error = new Error(message) as FetchError;
	error.status = status;
	return error;
}

/**
 * Search torrents via Jackett
 */
export async function searchTorrents(params: TorrentSearchParams): Promise<TorrentSearchResponse> {
	const searchParams = new URLSearchParams();

	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== null) {
			searchParams.set(key, value.toString());
		}
	}

	const response = await fetch(`/api/torrents/search?${searchParams}`);

	if (!response.ok) {
		throw createFetchError(`Failed to search torrents: ${response.statusText}`, response.status);
	}

	return response.json();
}

/**
 * Get cached torrent information for IMDB IDs
 */
export async function getTorrentCache(imdbIds: string[]): Promise<Record<string, TorrentResult>> {
	const response = await fetch('/api/torrents/cache', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ imdbIds }),
	});

	if (!response.ok) {
		throw createFetchError(`Failed to get torrent cache: ${response.statusText}`, response.status);
	}

	return response.json();
}
