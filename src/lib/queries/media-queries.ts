import { createQuery } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/query-keys';
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

export function createMediaListQuery(type: 'movie' | 'tv' | 'all' = 'all') {
	return createQuery(() => ({
		queryKey: queryKeys.media.list(type),
		queryFn: () => fetchMediaList(type),
	}));
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

export function createMediaDetailQuery(id: string) {
	return createQuery(() => ({
		queryKey: queryKeys.media.detail(id),
		queryFn: () => fetchMediaDetail(id),
		enabled: !!id,
	}));
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

export function createSearchMediaQuery(query: () => string) {
	return createQuery(() => ({
		queryKey: queryKeys.media.search(query()),
		queryFn: () => searchMedia(query()),
		enabled: query().length >= 2,
	}));
}

export interface ProgressInfo {
	status: string;
	progress: number;
	downloadSpeed: number;
	uploadSpeed: number;
	peers: number;
	isActive: boolean;
	filePath: string | null;
	fileSize?: number;
}

export async function fetchMediaProgress(id: string): Promise<ProgressInfo> {
	const response = await fetch(`/api/media/${id}/progress`);
	if (!response.ok) {
		throw createFetchError(`Failed to fetch progress: ${response.statusText}`, response.status);
	}
	return response.json();
}

export function createMediaProgressQuery(id: string, options?: { enabled?: boolean; refetchInterval?: number }) {
	return createQuery(() => ({
		queryKey: ['media', 'progress', id],
		queryFn: () => fetchMediaProgress(id),
		enabled: options?.enabled,
		refetchInterval: options?.refetchInterval ?? 1000,
	}));
}
