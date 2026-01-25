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
			const previousShows = queryClient.getQueryData<Media[]>(queryKeys.media.list('tv'));

			// Optimistically update to the new value
			if (previousMovies) {
				queryClient.setQueryData<Media[]>(
					queryKeys.media.list('movie'),
					previousMovies.filter((media) => media.id !== id)
				);
			}

			if (previousShows) {
				queryClient.setQueryData<Media[]>(
					queryKeys.media.list('tv'),
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
				queryClient.setQueryData(queryKeys.media.list('tv'), context.previousShows);
			}
		},
		onSettled: (deletedId: string | undefined) => {
			// Always refetch after error or success
			queryClient.invalidateQueries({
				queryKey: queryKeys.media.lists(),
			});

			// Remove the detail cache for the deleted item
			if (deletedId) {
				queryClient.removeQueries({
					queryKey: queryKeys.media.detail(deletedId),
				});
			}
		},
	};

	return createMutation<string, Error, string, DeleteMediaContext>(() => options);
}

/**
 * Create a mutation for retrying a download
 */
export function createRetryDownloadMutation() {
	const queryClient = useQueryClient();

	const options: CreateMutationOptions<void, Error, string, unknown> = {
		mutationFn: async (id: string): Promise<void> => {
			const response = await fetch(`/api/media/${id}/retry`, {
				method: 'POST',
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.message || `Failed to retry download: ${response.statusText}`);
			}
		},
		onSuccess: (_data, id) => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.media.detail(id),
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.media.lists(),
			});
		},
	};

	return createMutation<void, Error, string, unknown>(() => options);
}
