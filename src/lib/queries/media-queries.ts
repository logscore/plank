import type { Media } from '$lib/types';

export interface FetchError extends Error {
	status?: number;
}

function createFetchError(message: string, status?: number): FetchError {
	const error = new Error(message) as FetchError;
	error.status = status;
	return error;
}

/**
 * Fetch media list by type
 */
export async function fetchMediaList(type: 'movie' | 'tv' | 'all'): Promise<Media[]> {
	const params = type !== 'all' ? `?type=${type}` : '';
	const response = await fetch(`/api/media${params}`);

	if (!response.ok) {
		throw createFetchError(`Failed to fetch ${type} media: ${response.statusText}`, response.status);
	}

	return response.json();
}

/**
 * Fetch a single media item by ID
 */
export async function fetchMediaDetail(id: string): Promise<Media> {
	const response = await fetch(`/api/media/${id}`);

	if (!response.ok) {
		throw createFetchError(`Failed to fetch media detail: ${response.statusText}`, response.status);
	}

	return response.json();
}

/**
 * Search media in the user's library
 */
export async function searchMedia(query: string): Promise<Media[]> {
	if (query.length < 2) {
		return [];
	}

	const response = await fetch(`/api/media/search?q=${encodeURIComponent(query)}`);

	if (!response.ok) {
		throw createFetchError(`Failed to search media: ${response.statusText}`, response.status);
	}

	return response.json();
}
