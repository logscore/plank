import { createQuery } from "@tanstack/svelte-query";
import { queryKeys } from "$lib/query-keys";
import type { FetchError } from "$lib/types";

export interface ProwlarrIndexer {
	id: number;
	name: string;
	protocol: string;
	optimistic?: boolean;
}

export interface ProwlarrIndexerSchema {
	name: string;
	implementation: string;
	protocol?: string;
}

export async function fetchProwlarrIndexers(): Promise<ProwlarrIndexer[]> {
	const response = await fetch("/api/prowlarr/indexer");
	if (!response.ok) {
		const err: FetchError = new Error("Failed to fetch indexers");
		err.status = response.status;
		throw err;
	}
	return response.json();
}

export async function fetchProwlarrIndexerSchemas(): Promise<ProwlarrIndexerSchema[]> {
	const response = await fetch("/api/prowlarr/indexer/schema");
	if (!response.ok) {
		const err: FetchError = new Error("Failed to fetch indexer schemas");
		err.status = response.status;
		throw err;
	}
	return response.json();
}

export function createProwlarrIndexersQuery(enabled: () => boolean) {
	return createQuery(() => ({
		queryKey: queryKeys.system.prowlarr.indexers(),
		queryFn: fetchProwlarrIndexers,
		enabled: enabled(),
	}));
}

export function createProwlarrIndexerSchemasQuery(enabled: () => boolean) {
	return createQuery(() => ({
		queryKey: queryKeys.system.prowlarr.schemas(),
		queryFn: fetchProwlarrIndexerSchemas,
		enabled: enabled(),
	}));
}
