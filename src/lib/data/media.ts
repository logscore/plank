import { createMutation, createQuery } from "@tanstack/svelte-query";
import { invalidate } from "$app/navigation";
import type { Media, MediaType, OpenSubtitleResult, SourceCandidate, SubtitleTrackResponse } from "$lib/types";
import { apiRequest, uploadInChunks } from "./client";

export interface AddMediaParams {
	magnetLink: string;
	title?: string;
	tmdbId?: number;
	type?: MediaType;
	year?: number;
}

export function createAddMediaMutation() {
	return createMutation<Media, Error, AddMediaParams>(() => ({
		mutationFn: (params) =>
			apiRequest<Media>("/api/media", "Failed to add media", {
				json: params,
				method: "POST",
			}),
		onSuccess: async () => {
			await invalidate("/api/media");
		},
	}));
}

export function createDeleteMediaMutation() {
	return createMutation<void, Error, string>(() => ({
		mutationFn: (id) => apiRequest<void>(`/api/media/${id}`, "Failed to delete media", { method: "DELETE" }),
		onSuccess: async () => {
			await invalidate("/api/media");
		},
	}));
}

/** Hold the checkmark on screen long enough to read before the card leaves. */
const MARK_WATCHED_HOLD_MS = 500;

export function createMarkWatchedMutation() {
	return createMutation<void, Error, string>(() => ({
		mutationFn: (id) =>
			apiRequest<void>(`/api/media/${id}/watched`, "Failed to mark as watched", { method: "POST" }),
		onSuccess: async () => {
			await new Promise((resolve) => setTimeout(resolve, MARK_WATCHED_HOLD_MS));
			await invalidate("/api/media");
		},
	}));
}

export interface RetryMediaInput {
	downloadId?: string | null;
	id: string;
	magnetLink?: string;
	mode?: "same" | "replace" | "remove";
}

export function createRetryMediaMutation() {
	return createMutation<void, Error, RetryMediaInput>(() => ({
		mutationFn: ({ id, mode, magnetLink, downloadId }) => {
			const hasBody = mode !== undefined || magnetLink !== undefined || downloadId !== undefined;
			return apiRequest<void>(`/api/media/${id}/retry`, "Media action failed", {
				json: hasBody ? { downloadId, magnetLink, mode } : undefined,
				method: "POST",
			});
		},
		onSuccess: async (_result, input) => {
			await Promise.all([invalidate("/api/media"), invalidate(`/api/media/${input.id}`)]);
		},
	}));
}

export async function uploadMediaFile(
	mediaId: string,
	file: File,
	onProgress: (progress: number) => void
): Promise<void> {
	await uploadInChunks(`/api/media/${mediaId}/upload`, file, "Upload failed", onProgress);
	await Promise.all([invalidate("/api/media"), invalidate(`/api/media/${mediaId}`)]);
}

export interface DownloadSubtitleParams {
	fileId: number;
	language: string;
	mediaId: string;
}

export function createDownloadSubtitleMutation() {
	return createMutation<SubtitleTrackResponse, Error, DownloadSubtitleParams>(() => ({
		mutationFn: (params) =>
			apiRequest<SubtitleTrackResponse>(
				`/api/media/${params.mediaId}/subtitles/download`,
				"Failed to download subtitle",
				{
					json: { fileId: params.fileId, language: params.language },
					method: "POST",
				}
			),
		onSuccess: async (_data, params) => {
			await invalidate(`/api/media/${params.mediaId}`);
		},
		retry: false,
	}));
}

export interface DeleteSubtitleParams {
	mediaId: string;
	subtitleId: string;
}

export function createDeleteSubtitleMutation() {
	return createMutation<unknown, Error, DeleteSubtitleParams>(() => ({
		mutationFn: (params) =>
			apiRequest(`/api/media/${params.mediaId}/subtitles/${params.subtitleId}`, "Failed to delete subtitle", {
				method: "DELETE",
			}),
		onSuccess: async (_data, params) => {
			await invalidate(`/api/media/${params.mediaId}`);
		},
	}));
}

export interface SavePositionParams {
	duration?: number;
	id: string;
	position: number;
}

export function createSavePositionMutation() {
	return createMutation<void, Error, SavePositionParams>(() => ({
		mutationFn: (params) =>
			apiRequest<void>(`/api/media/${params.id}/position`, "Failed to save position", {
				json: { duration: params.duration, position: params.position },
				method: "PUT",
			}),
	}));
}

interface SourceSearchResult {
	/** The text the server searched with, so the caller can show it. */
	query: string;
	results: SourceCandidate[];
}

/** An indexer search takes seconds, so hold the result while the user works on one title. */
const SOURCES_STALE_TIME_MS = 10 * 60 * 1000;

const mediaKeys = {
	sources: (mediaId: string | null) => ["media", mediaId, "sources"] as const,
};

function searchMediaSources(mediaId: string): Promise<SourceSearchResult> {
	return apiRequest(`/api/media/${mediaId}/sources`, "Failed to search indexers");
}

/** Cached indexer releases for one title. Reopening the dialog reuses the last search. */
export function createMediaSourcesQuery(mediaId: () => string | null, enabled: () => boolean) {
	return createQuery(() => ({
		enabled: enabled() && mediaId() !== null,
		queryFn: () => searchMediaSources(mediaId() as string),
		queryKey: mediaKeys.sources(mediaId()),
		staleTime: SOURCES_STALE_TIME_MS,
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
	if (options?.episodeNumber !== undefined && options.episodeNumber !== null) {
		params.set("episodeNumber", String(options.episodeNumber));
	}
	return apiRequest(`/api/media/${mediaId}/subtitles/search?${params}`, "Failed to search subtitles");
}
