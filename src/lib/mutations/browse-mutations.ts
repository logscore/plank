import type { CreateMutationOptions } from '@tanstack/svelte-query';
import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/query-keys';
import type { Media } from '$lib/types';

export interface ResolveTorrentParams {
	imdbId: string | null;
	tmdbId: number;
	title: string;
}

export interface AddFromBrowseParams {
	magnetLink: string;
	title: string;
	year?: number | null;
	tmdbId?: number;
}

/**
 * Create a mutation for adding media to library from browse
 */
export function createAddFromBrowseMutation() {
	const queryClient = useQueryClient();

	const options: CreateMutationOptions<Media, Error, AddFromBrowseParams, undefined> = {
		mutationFn: async (params: AddFromBrowseParams): Promise<Media> => {
			const response = await fetch('/api/media', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(params),
			});

			if (!response.ok) {
				throw new Error('Failed to add to library');
			}

			return response.json();
		},
		onSuccess: () => {
			// Invalidate media list queries
			queryClient.invalidateQueries({
				queryKey: queryKeys.media.lists(),
			});
		},
	};

	return createMutation<Media, Error, AddFromBrowseParams, undefined>(() => options);
}

export interface ResolveSeasonParams {
	tmdbId: number;
	seasonNumber: number;
	showTitle: string;
	imdbId?: string;
}
