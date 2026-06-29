import { createQuery } from "@tanstack/svelte-query";
import { queryKeys } from "$lib/query-keys";
import type { FetchError, Media, OpenSubtitleResult } from "$lib/types";

export type { FetchError } from "$lib/types";

/**
 * Fetch media list by type
 */
export async function fetchMediaList(type: "movie" | "show" | "all"): Promise<Media[]> {
	const params = type !== "all" ? `?type=${type}` : "";
	const response = await fetch(`/api/media${params}`);

	if (!response.ok) {
		const err: FetchError = new Error(`Failed to fetch ${type} media: ${response.statusText}`);
		err.status = response.status;
		throw err;
	}

	return response.json();
}

export function createMediaListQuery(type: "movie" | "show" | "all" = "all") {
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
		const err: FetchError = new Error(`Failed to fetch media detail: ${response.statusText}`);
		err.status = response.status;
		throw err;
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
		const err: FetchError = new Error(`Failed to search media: ${response.statusText}`);
		err.status = response.status;
		throw err;
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
		const err: FetchError = new Error(`Failed to fetch progress: ${response.statusText}`);
		err.status = response.status;
		throw err;
	}
	return response.json();
}

export function createMediaProgressQuery(id: string, options?: { enabled?: boolean; refetchInterval?: number }) {
	return createQuery(() => ({
		queryKey: queryKeys.media.progress(id),
		queryFn: () => fetchMediaProgress(id),
		enabled: options?.enabled,
		refetchInterval: options?.refetchInterval ?? 1000,
	}));
}

async function fetchContinueWatching(): Promise<Media[]> {
	const response = await fetch("/api/media/continue-watching");
	if (!response.ok) {
		const err: FetchError = new Error("Failed to fetch continue watching");
		err.status = response.status;
		throw err;
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

export async function fetchPlayPosition(id: string): Promise<PlayPosition> {
	const response = await fetch(`/api/media/${id}/position`);
	if (!response.ok) {
		const err: FetchError = new Error("Failed to fetch position");
		err.status = response.status;
		throw err;
	}
	return response.json();
}

export interface SubtitleTrackResponse {
	id: string;
	mediaId: string;
	language: string;
	label: string;
	source: string;
	isDefault: boolean;
	isForced: boolean;
	src: string;
}

export async function fetchSubtitleTracks(id: string): Promise<SubtitleTrackResponse[]> {
	const response = await fetch(`/api/media/${id}/subtitles`);
	if (!response.ok) {
		const err: FetchError = new Error("Failed to fetch subtitles");
		err.status = response.status;
		throw err;
	}
	return response.json();
}

export function createSubtitleTracksQuery(id: string) {
	return createQuery(() => ({
		queryKey: queryKeys.media.subtitles(id),
		queryFn: () => fetchSubtitleTracks(id),
		enabled: !!id,
	}));
}

export async function searchOpenSubtitles(
	mediaId: string,
	options?: {
		languages?: string;
		seasonNumber?: number;
		episodeNumber?: number | null;
	}
): Promise<OpenSubtitleResult[]> {
	const params = new URLSearchParams();
	if (options?.languages) {
		params.set("languages", options.languages);
	}
	if (options?.seasonNumber !== undefined) {
		params.set("seasonNumber", String(options.seasonNumber));
	}
	if (options?.episodeNumber != null) {
		params.set("episodeNumber", String(options.episodeNumber));
	}
	const response = await fetch(`/api/media/${mediaId}/subtitles/search?${params.toString()}`);
	if (!response.ok) {
		const err: FetchError = new Error("Failed to search subtitles");
		err.status = response.status;
		throw err;
	}
	return response.json();
}
