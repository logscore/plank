import { createMutation, createQuery } from "@tanstack/svelte-query";
import { apiRequest, queryClient } from "./client";

const STATUS_STALE_TIME_MS = 60 * 60 * 1000;

const prowlarrKeys = {
	indexers: ["prowlarr", "indexers"] as const,
	schemas: ["prowlarr", "schemas"] as const,
	status: ["prowlarr", "status"] as const,
};

export interface ProwlarrStatus {
	configured: boolean;
	needsSetup: boolean;
}

export interface ProwlarrIndexer {
	id: number;
	name: string;
	optimistic?: boolean;
	protocol: string;
}

export interface ProwlarrIndexerSchema {
	implementation: string;
	name: string;
	protocol?: string;
}

export function fetchProwlarrStatus(): Promise<ProwlarrStatus> {
	return apiRequest("/api/prowlarr/status", "Failed to fetch Prowlarr status");
}

function fetchProwlarrIndexers(): Promise<ProwlarrIndexer[]> {
	return apiRequest("/api/prowlarr/indexer", "Failed to fetch indexers");
}

async function fetchProwlarrIndexerSchemas(): Promise<ProwlarrIndexerSchema[]> {
	const schemas = await apiRequest<ProwlarrIndexerSchema[]>(
		"/api/prowlarr/indexer/schema",
		"Failed to fetch indexer schemas"
	);
	// Prowlarr repeats some names. Callers key lists and look schemas up by name,
	// so keep the first schema of each name.
	const byName = new Map<string, ProwlarrIndexerSchema>();
	for (const schema of schemas) {
		if (!byName.has(schema.name)) {
			byName.set(schema.name, schema);
		}
	}
	return [...byName.values()];
}

export function createProwlarrStatusQuery() {
	return createQuery(() => ({
		queryFn: fetchProwlarrStatus,
		queryKey: prowlarrKeys.status,
		staleTime: STATUS_STALE_TIME_MS,
	}));
}

export function createProwlarrIndexersQuery(enabled: () => boolean) {
	return createQuery(() => ({
		enabled: enabled(),
		queryFn: fetchProwlarrIndexers,
		queryKey: prowlarrKeys.indexers,
	}));
}

export function createProwlarrIndexerSchemasQuery(enabled: () => boolean) {
	return createQuery(() => ({
		enabled: enabled(),
		queryFn: fetchProwlarrIndexerSchemas,
		queryKey: prowlarrKeys.schemas,
	}));
}

export function prefetchProwlarrStatus(): void {
	queryClient.prefetchQuery({
		queryFn: fetchProwlarrStatus,
		queryKey: prowlarrKeys.status,
		staleTime: STATUS_STALE_TIME_MS,
	});
}

export function createAddProwlarrIndexerMutation() {
	return createMutation<{ success: true }, Error, ProwlarrIndexerSchema>(() => ({
		mutationFn: (schema) =>
			apiRequest("/api/prowlarr/indexer", `Failed to add ${schema.name}`, {
				json: schema,
				method: "POST",
			}),
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey: prowlarrKeys.indexers });
		},
	}));
}

export function createDeleteProwlarrIndexerMutation() {
	return createMutation<{ success: true }, Error, number>(() => ({
		mutationFn: (id) =>
			apiRequest(`/api/prowlarr/indexer?id=${id}`, "Failed to remove indexer", { method: "DELETE" }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: prowlarrKeys.indexers });
		},
	}));
}

export interface TestProwlarrConnectionInput {
	apiKey?: string;
	url?: string;
}

export interface ProwlarrConnectionResult {
	error?: string;
	message?: string;
	success: boolean;
}

export function createTestProwlarrConnectionMutation() {
	return createMutation<ProwlarrConnectionResult, Error, TestProwlarrConnectionInput>(() => ({
		mutationFn: async (input) => {
			const result = await apiRequest<ProwlarrConnectionResult | undefined>(
				"/api/prowlarr/test",
				"Connection test failed",
				{ json: input, method: "POST" }
			);
			return result ?? { message: "Connection test returned no data", success: false };
		},
	}));
}
