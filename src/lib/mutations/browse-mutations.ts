import type { CreateMutationOptions } from '@tanstack/svelte-query';
import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/query-keys';
import type { Media } from '$lib/types';

export interface AddFromBrowseParams {
	magnetLink: string;
	title: string;
	year?: number | null;
	tmdbId?: number;
}

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
			queryClient.invalidateQueries({ queryKey: queryKeys.media.lists() });
		},
	};

	return createMutation<Media, Error, AddFromBrowseParams, undefined>(() => options);
}
