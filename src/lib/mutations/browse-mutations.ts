import type { CreateMutationOptions } from '@tanstack/svelte-query';
import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/query-keys';
import type { Media } from '$lib/types';

export interface AddFromBrowseMagnetParams {
	mode?: 'magnet';
	magnetLink: string;
	title: string;
	year?: number | null;
	tmdbId?: number;
}

export interface AddSeasonFromBrowseParams {
	mode: 'browse-season';
	tmdbId: number;
	seasonNumber: number;
	title: string;
	year?: number | null;
	posterUrl?: string | null;
	backdropUrl?: string | null;
	overview?: string | null;
	genres?: string[] | null;
	certification?: string | null;
}

export interface AddSeasonFromBrowseResult {
	mode: 'browse-season';
	status: 'queued';
	showId: string;
	seasonId: string;
	seasonNumber: number;
	episodeCount: number;
}

export type AddFromBrowseParams = AddFromBrowseMagnetParams | AddSeasonFromBrowseParams;
export type AddFromBrowseResponse = Media | AddSeasonFromBrowseResult;

export function createAddFromBrowseMutation() {
	const queryClient = useQueryClient();

	const options: CreateMutationOptions<AddFromBrowseResponse, Error, AddFromBrowseParams, undefined> = {
		mutationFn: async (params: AddFromBrowseParams): Promise<AddFromBrowseResponse> => {
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
			queryClient.invalidateQueries({ queryKey: queryKeys.media.lists() });
		},
	};

	return createMutation<AddFromBrowseResponse, Error, AddFromBrowseParams, undefined>(() => options);
}
