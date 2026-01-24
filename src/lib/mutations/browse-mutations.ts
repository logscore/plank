import type { CreateMutationOptions } from '@tanstack/svelte-query';
import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { type ResolveResponse, resolveTorrent } from '$lib/queries/browse-queries';
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
 * Create a mutation for resolving a torrent from IMDB/TMDB ID
 */
export function createResolveTorrentMutation() {
	const queryClient = useQueryClient();

	const options: CreateMutationOptions<ResolveResponse, Error, ResolveTorrentParams, undefined> = {
		mutationFn: (params: ResolveTorrentParams): Promise<ResolveResponse> => resolveTorrent(params),
		onSuccess: (result: ResolveResponse, params: ResolveTorrentParams) => {
			if (result.success && result.torrent) {
				// Invalidate browse queries to show updated torrent cache
				queryClient.invalidateQueries({
					queryKey: queryKeys.browse.all,
				});

				// Invalidate torrent cache queries
				queryClient.invalidateQueries({
					queryKey: queryKeys.torrents.all,
				});

				// Cache the resolve result
				queryClient.setQueryData(queryKeys.browse.resolve(params.tmdbId), result);
			}
		},
	};

	return createMutation<ResolveResponse, Error, ResolveTorrentParams, undefined>(() => options);
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
