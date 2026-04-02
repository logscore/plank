import type { CreateMutationOptions } from '@tanstack/svelte-query';
import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/query-keys';
import type { Media, MediaType } from '$lib/types';

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

type AddMediaContext = undefined;

interface DeleteMediaContext {
	previousMovies?: Media[];
	previousShows?: Media[];
}

/**
 * Create a mutation for adding media to the library
 */
export function createAddMediaMutation() {
	const queryClient = useQueryClient();

	const options: CreateMutationOptions<AddMediaResponse, Error, AddMediaParams, AddMediaContext> = {
		mutationFn: async (params: AddMediaParams): Promise<AddMediaResponse> => {
			const response = await fetch('/api/media', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(params),
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.message || `Failed to add media: ${response.statusText}`);
			}

			return response.json();
		},
		onSuccess: () => {
			// Invalidate media list queries to trigger refetch
			queryClient.invalidateQueries({
				queryKey: queryKeys.media.lists(),
			});
		},
	};

	return createMutation<AddMediaResponse, Error, AddMediaParams, AddMediaContext>(() => options);
}

/**
 * Create a mutation for deleting media from the library
 */
export function createDeleteMediaMutation() {
	const queryClient = useQueryClient();

	const options: CreateMutationOptions<string, Error, string, DeleteMediaContext> = {
		mutationFn: async (id: string): Promise<string> => {
			const response = await fetch(`/api/media/${id}`, {
				method: 'DELETE',
			});

			if (!response.ok) {
				throw new Error(`Failed to delete media: ${response.statusText}`);
			}

			return id;
		},
		onMutate: async (id: string): Promise<DeleteMediaContext> => {
			// Cancel any outgoing refetches
			await queryClient.cancelQueries({
				queryKey: queryKeys.media.lists(),
			});

			// Snapshot the previous values
			const previousMovies = queryClient.getQueryData<Media[]>(queryKeys.media.list('movie'));
			const previousShows = queryClient.getQueryData<Media[]>(queryKeys.media.list('show'));

			// Optimistically update to the new value
			if (previousMovies) {
				queryClient.setQueryData<Media[]>(
					queryKeys.media.list('movie'),
					previousMovies.filter((media) => media.id !== id)
				);
			}

			if (previousShows) {
				queryClient.setQueryData<Media[]>(
					queryKeys.media.list('show'),
					previousShows.filter((media) => media.id !== id)
				);
			}

			// Return a context with the previous values
			return { previousMovies, previousShows };
		},
		onError: (_err: Error, _id: string, context: DeleteMediaContext | undefined) => {
			// Rollback to the previous values on error
			if (context?.previousMovies) {
				queryClient.setQueryData(queryKeys.media.list('movie'), context.previousMovies);
			}
			if (context?.previousShows) {
				queryClient.setQueryData(queryKeys.media.list('show'), context.previousShows);
			}
		},
		onSettled: (deletedId: string | undefined) => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.media.all,
				refetchType: 'all',
			});

			if (deletedId) {
				queryClient.removeQueries({
					queryKey: queryKeys.media.detail(deletedId),
				});
				queryClient.removeQueries({
					queryKey: queryKeys.media.position(deletedId),
				});
			}
		},
	};

	return createMutation<string, Error, string, DeleteMediaContext>(() => options);
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
	const queryClient = useQueryClient();

	return createMutation<unknown, Error, DownloadSubtitleParams>(() => ({
		mutationFn: async (params: DownloadSubtitleParams) => {
			const response = await fetch(`/api/media/${params.mediaId}/subtitles/download`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					fileId: params.fileId,
					language: params.language,
				}),
			});
			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.message || 'Failed to download subtitle');
			}
			return response.json();
		},
		onSuccess: (_data, params) => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.media.subtitles(params.mediaId),
			});
		},
	}));
}

export interface SetDefaultSubtitleParams {
	mediaId: string;
	subtitleId: string;
	isDefault: boolean;
}

export function createSetDefaultSubtitleMutation() {
	const queryClient = useQueryClient();

	return createMutation<unknown, Error, SetDefaultSubtitleParams>(() => ({
		mutationFn: async (params: SetDefaultSubtitleParams) => {
			const response = await fetch(`/api/media/${params.mediaId}/subtitles/${params.subtitleId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isDefault: params.isDefault }),
			});
			if (!response.ok) {
				throw new Error('Failed to update subtitle');
			}
			return response.json();
		},
		onSuccess: (_data, params) => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.media.subtitles(params.mediaId),
			});
		},
	}));
}

export interface DeleteSubtitleParams {
	mediaId: string;
	subtitleId: string;
}

export function createDeleteSubtitleMutation() {
	const queryClient = useQueryClient();

	return createMutation<unknown, Error, DeleteSubtitleParams>(() => ({
		mutationFn: async (params: DeleteSubtitleParams) => {
			const response = await fetch(`/api/media/${params.mediaId}/subtitles/${params.subtitleId}`, {
				method: 'DELETE',
			});
			if (!response.ok) {
				throw new Error('Failed to delete subtitle');
			}
			return response.json();
		},
		onSuccess: (_data, params) => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.media.subtitles(params.mediaId),
			});
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
	const queryClient = useQueryClient();

	return createMutation<void, Error, SavePositionParams>(() => ({
		mutationFn: async (params: SavePositionParams): Promise<void> => {
			const response = await fetch(`/api/media/${params.id}/position`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					position: params.position,
					duration: params.duration,
				}),
			});
			if (!response.ok) {
				throw new Error('Failed to save position');
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.media.continueWatching(),
			});
		},
	}));
}
