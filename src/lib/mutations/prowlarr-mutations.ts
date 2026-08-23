import { createMutation, useQueryClient } from "@tanstack/svelte-query";
import type { ProwlarrIndexerSchema } from "$lib/queries/prowlarr-queries";
import { queryKeys } from "$lib/query-keys";

export function createAddProwlarrIndexerMutation() {
	const queryClient = useQueryClient();

	return createMutation<{ success: true }, Error, ProwlarrIndexerSchema>(() => ({
		mutationFn: async (schema) => {
			const response = await fetch("/api/prowlarr/indexer", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
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
				method: "DELETE",
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.error || "Failed to remove indexer");
			}

			return response.json();
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.system.prowlarr.indexers() });
		},
	}));
}

export interface TestProwlarrConnectionInput {
	url?: string;
	apiKey?: string;
}

export interface ProwlarrConnectionResult {
	success: boolean;
	message?: string;
	error?: string;
}

export function createTestProwlarrConnectionMutation() {
	return createMutation<ProwlarrConnectionResult, Error, TestProwlarrConnectionInput>(() => ({
		mutationFn: async (input) => {
			const response = await fetch("/api/prowlarr/test", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			const result = (await response.json().catch(() => null)) as ProwlarrConnectionResult | null;
			if (!response.ok) {
				throw new Error(result?.message || result?.error || `Connection test failed (${response.status})`);
			}
			return result ?? { success: false, message: "Connection test returned no data" };
		},
	}));
}
