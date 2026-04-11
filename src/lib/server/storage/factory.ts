import { eq } from 'drizzle-orm';
import { config as envConfig } from '$lib/config';
import { decrypt } from '$lib/server/crypto';
import { db } from '$lib/server/db/index';
import { storageConfig as storageConfigTable } from '$lib/server/db/schema';
import { LocalStorageAdapter } from './local';
import { S3StorageAdapter } from './s3';
import type { LocalStorageConfig, StorageAdapter, StorageConfig } from './types';

const DEFAULT_STORAGE_CACHE_KEY = '__default__';
const adapterCache = new Map<string, StorageAdapter>();

function getDefaultLocalStorageConfig(): LocalStorageConfig {
	return {
		provider: 'local',
		basePath: envConfig.paths.data,
	};
}

function createStorageAdapter(storageConfig: StorageConfig): StorageAdapter {
	if (storageConfig.provider === 's3') {
		return new S3StorageAdapter(storageConfig);
	}
	return new LocalStorageAdapter(storageConfig);
}

function getCacheKey(organizationId: string | null | undefined): string {
	return organizationId ?? DEFAULT_STORAGE_CACHE_KEY;
}

export async function getStorageAdapter(organizationId?: string | null): Promise<StorageAdapter> {
	const cacheKey = getCacheKey(organizationId);
	const cachedAdapter = adapterCache.get(cacheKey);
	if (cachedAdapter) {
		return cachedAdapter;
	}

	if (!organizationId) {
		const adapter = createStorageAdapter(getDefaultLocalStorageConfig());
		adapterCache.set(cacheKey, adapter);
		return adapter;
	}

	const storedConfig = await db.query.storageConfig.findFirst({
		where: eq(storageConfigTable.organizationId, organizationId),
	});

	const adapter = storedConfig
		? createStorageAdapter(JSON.parse(decrypt(storedConfig.config)) as StorageConfig)
		: createStorageAdapter(getDefaultLocalStorageConfig());

	adapterCache.set(cacheKey, adapter);
	return adapter;
}

export function invalidateStorageAdapterCache(organizationId?: string | null): void {
	if (organizationId === undefined) {
		adapterCache.clear();
		return;
	}
	adapterCache.delete(getCacheKey(organizationId));
}
