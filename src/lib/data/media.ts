import { createMutation, createQuery } from "@tanstack/svelte-query";
import { invalidate } from "$app/navigation";
import type { Media, MediaType, OpenSubtitleResult, SourceCandidate } from "$lib/types";
import { apiRequest } from "./client";

export interface AddMediaParams {
	magnetLink: string;
	type?: MediaType;
	title?: string;
	year?: number;
	tmdbId?: number;
}

export interface AddMediaResponse extends Media {
	_seasonAdded?: boolean;
}

export function createAddMediaMutation() {
	return createMutation<AddMediaResponse, Error, AddMediaParams>(() => ({
		mutationFn: (params) =>
			apiRequest<AddMediaResponse>("/api/media", "Failed to add media", {
				method: "POST",
				json: params,
			}),
		onSuccess: async () => {
			await invalidate("/api/media");
		},
	}));
}

export function createDeleteMediaMutation() {
	return createMutation<string, Error, string>(() => ({
		mutationFn: async (id) => {
			await apiRequest<void>(`/api/media/${id}`, "Failed to delete media", { method: "DELETE" });
			return id;
		},
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
	id: string;
	mode?: "same" | "replace" | "remove";
	magnetLink?: string;
	downloadId?: string | null;
}

export interface RetryMediaResult {
	success?: boolean;
	message?: string;
}

export function createRetryMediaMutation() {
	return createMutation<RetryMediaResult, Error, RetryMediaInput>(() => ({
		mutationFn: async ({ id, mode, magnetLink, downloadId }) => {
			const hasBody = mode !== undefined || magnetLink !== undefined || downloadId !== undefined;
			const result = await apiRequest<RetryMediaResult | undefined>(
				`/api/media/${id}/retry`,
				"Media action failed",
				{
					method: "POST",
					json: hasBody ? { mode, magnetLink, downloadId } : undefined,
				}
			);
			return result ?? {};
		},
		onSuccess: async (_result, input) => {
			await Promise.all([invalidate("/api/media"), invalidate(`/api/media/${input.id}`)]);
		},
	}));
}

export interface DownloadSubtitleParams {
	mediaId: string;
	fileId: number;
	language: string;
}

export function createDownloadSubtitleMutation() {
	return createMutation<unknown, Error, DownloadSubtitleParams>(() => ({
		mutationFn: (params) =>
			apiRequest(`/api/media/${params.mediaId}/subtitles/download`, "Failed to download subtitle", {
				method: "POST",
				json: { fileId: params.fileId, language: params.language },
			}),
		onSuccess: async (_data, params) => {
			await invalidate(`/api/media/${params.mediaId}`);
		},
	}));
}

export interface SetDefaultSubtitleParams {
	mediaId: string;
	subtitleId: string;
	isDefault: boolean;
}

export function createSetDefaultSubtitleMutation() {
	return createMutation<unknown, Error, SetDefaultSubtitleParams>(() => ({
		mutationFn: (params) =>
			apiRequest(`/api/media/${params.mediaId}/subtitles/${params.subtitleId}`, "Failed to update subtitle", {
				method: "PATCH",
				json: { isDefault: params.isDefault },
			}),
		onSuccess: async (_data, params) => {
			await invalidate(`/api/media/${params.mediaId}`);
		},
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
	id: string;
	position: number;
	duration?: number;
}

export function createSavePositionMutation() {
	return createMutation<void, Error, SavePositionParams>(() => ({
		mutationFn: (params) =>
			apiRequest<void>(`/api/media/${params.id}/position`, "Failed to save position", {
				method: "PUT",
				json: { position: params.position, duration: params.duration },
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
		queryKey: mediaKeys.sources(mediaId()),
		queryFn: () => searchMediaSources(mediaId() as string),
		enabled: enabled() && mediaId() !== null,
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
	if (options?.episodeNumber != null) {
		params.set("episodeNumber", String(options.episodeNumber));
	}
	return apiRequest(`/api/media/${mediaId}/subtitles/search?${params}`, "Failed to search subtitles");
}
