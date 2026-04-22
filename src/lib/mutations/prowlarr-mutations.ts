import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import type { ProwlarrIndexerSchema } from '$lib/queries/prowlarr-queries';
import { queryKeys } from '$lib/query-keys';

export function createAddProwlarrIndexerMutation() {
	const queryClient = useQueryClient();

	return createMutation<{ success: true }, Error, ProwlarrIndexerSchema>(() => ({
		mutationFn: async (schema) => {
			const response = await fetch('/api/prowlarr/indexer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(schema),
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.error || `Failed to add ${schema.name}`);
			}

			return response.json();
		},
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.system.prowlarr.indexers() });
		},
	}));
}

export function createDeleteProwlarrIndexerMutation() {
	const queryClient = useQueryClient();

	return createMutation<{ success: true }, Error, number>(() => ({
		mutationFn: async (id) => {
			const response = await fetch(`/api/prowlarr/indexer?id=${id}`, {
				method: 'DELETE',
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.error || 'Failed to remove indexer');
			}

			return response.json();
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.system.prowlarr.indexers() });
		},
	}));
}
