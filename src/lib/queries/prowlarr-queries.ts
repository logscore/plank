import { createQuery } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/query-keys';
import { createFetchError } from './fetch-error';

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
	const response = await fetch('/api/prowlarr/indexer');
	if (!response.ok) {
		throw createFetchError('Failed to fetch indexers', response.status);
	}
	return response.json();
}

export async function fetchProwlarrIndexerSchemas(): Promise<ProwlarrIndexerSchema[]> {
	const response = await fetch('/api/prowlarr/indexer/schema');
	if (!response.ok) {
		throw createFetchError('Failed to fetch indexer schemas', response.status);
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
