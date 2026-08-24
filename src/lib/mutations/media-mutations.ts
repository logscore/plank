import { createMutation } from "@tanstack/svelte-query";
import { invalidate } from "$app/navigation";
import type { Media, MediaType } from "$lib/types";

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

/**
 * Create a mutation for adding media to the library
 */
export function createAddMediaMutation() {
	return createMutation<AddMediaResponse, Error, AddMediaParams>(() => ({
		mutationFn: async (params: AddMediaParams): Promise<AddMediaResponse> => {
			const response = await fetch("/api/media", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(params),
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.message || `Failed to add media: ${response.statusText}`);
			}

			return response.json();
		},
		onSuccess: async () => {
			await invalidate("/api/media");
		},
	}));
}

/**
 * Create a mutation for deleting media from the library
 */
export function createDeleteMediaMutation() {
	return createMutation<string, Error, string>(() => ({
		mutationFn: async (id: string): Promise<string> => {
			const response = await fetch(`/api/media/${id}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				throw new Error(`Failed to delete media: ${response.statusText}`);
			}

			return id;
		},
		onSuccess: async () => {
			await invalidate("/api/media");
		},
	}));
}

export interface RetryMediaInput {
	id: string;
	mode?: "same" | "replace" | "remove";
	magnetLink?: string;
}

export interface RetryMediaResult {
	success?: boolean;
	message?: string;
}

export function createRetryMediaMutation() {
	return createMutation<RetryMediaResult, Error, RetryMediaInput>(() => ({
		mutationFn: async ({ id, mode, magnetLink }) => {
			const hasBody = mode !== undefined || magnetLink !== undefined;
			const response = await fetch(`/api/media/${id}/retry`, {
				method: "POST",
				headers: hasBody ? { "Content-Type": "application/json" } : undefined,
				body: hasBody ? JSON.stringify({ mode, magnetLink }) : undefined,
			});
			const result = (await response.json().catch(() => null)) as RetryMediaResult | null;
			if (!response.ok) {
				throw new Error(result?.message || "Media action failed");
			}
			return result ?? {};
		},
		onSuccess: async (_result, input) => {
			await Promise.all([invalidate("/api/media"), invalidate(`/api/media/${input.id}`)]);
		},
	}));
}

// =============================================================================
// Subtitle mutations
// =============================================================================

export interface DownloadSubtitleParams {
	mediaId: string;
	fileId: number;
	language: string;
}

export function createDownloadSubtitleMutation() {
	return createMutation<unknown, Error, DownloadSubtitleParams>(() => ({
		mutationFn: async (params: DownloadSubtitleParams) => {
			const response = await fetch(`/api/media/${params.mediaId}/subtitles/download`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					fileId: params.fileId,
					language: params.language,
				}),
			});
			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.message || "Failed to download subtitle");
			}
			return response.json();
		},
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
		mutationFn: async (params: SetDefaultSubtitleParams) => {
			const response = await fetch(`/api/media/${params.mediaId}/subtitles/${params.subtitleId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isDefault: params.isDefault }),
			});
			if (!response.ok) {
				throw new Error("Failed to update subtitle");
			}
			return response.json();
		},
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
		mutationFn: async (params: DeleteSubtitleParams) => {
			const response = await fetch(`/api/media/${params.mediaId}/subtitles/${params.subtitleId}`, {
				method: "DELETE",
			});
			if (!response.ok) {
				throw new Error("Failed to delete subtitle");
			}
			return response.json();
		},
		onSuccess: async (_data, params) => {
			await invalidate(`/api/media/${params.mediaId}`);
		},
	}));
}

// =============================================================================
// Position mutations
// =============================================================================

export interface SavePositionParams {
	id: string;
	position: number;
	duration?: number;
}

export function createSavePositionMutation() {
	return createMutation<void, Error, SavePositionParams>(() => ({
		mutationFn: async (params: SavePositionParams): Promise<void> => {
			const response = await fetch(`/api/media/${params.id}/position`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					position: params.position,
					duration: params.duration,
				}),
			});
			if (!response.ok) {
				throw new Error("Failed to save position");
			}
		},
	}));
}
