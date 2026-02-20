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

export async function fetchContinueWatching(): Promise<Media[]> {
	const response = await fetch('/api/media/continue-watching');
	if (!response.ok) {
		throw createFetchError('Failed to fetch continue watching', response.status);
	}
	return response.json();
}

export function createContinueWatchingQuery() {
	return createQuery(() => ({
		queryKey: queryKeys.media.continueWatching(),
		queryFn: fetchContinueWatching,
		staleTime: 30 * 1000,
	}));
}

export interface PlayPosition {
	position: number;
	duration: number | null;
}

export async function fetchPlayPosition(id: string, episodeId?: string): Promise<PlayPosition> {
	const params = episodeId ? `?episodeId=${episodeId}` : '';
	const response = await fetch(`/api/media/${id}/position${params}`);
	if (!response.ok) {
		throw createFetchError('Failed to fetch position', response.status);
	}
	return response.json();
}

export interface SubtitleTrackResponse {
	id: string;
	mediaId: string;
	episodeId: string | null;
	language: string;
	label: string;
	source: string;
	isDefault: boolean;
	isForced: boolean;
	src: string;
}

export async function fetchSubtitleTracks(id: string, episodeId?: string): Promise<SubtitleTrackResponse[]> {
	const params = episodeId ? `?episodeId=${episodeId}` : '';
	const response = await fetch(`/api/media/${id}/subtitles${params}`);
	if (!response.ok) {
		throw createFetchError('Failed to fetch subtitles', response.status);
	}
	return response.json();
}
