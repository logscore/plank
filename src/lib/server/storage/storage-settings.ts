import { eq } from 'drizzle-orm';
import { config } from '$lib/config';
import { decrypt, encrypt } from '$lib/server/crypto';
import { db } from '$lib/server/db/index';
import { storageConfig } from '$lib/server/db/schema';
import { invalidateStorageAdapterCache } from './factory';
import { LocalStorageAdapter } from './local';
import { S3StorageAdapter } from './s3';
import type { LocalStorageConfig, S3StorageConfig, StorageConfig, StorageProvider } from './types';

export interface OrganizationStorageSettings {
	enabled: boolean;
	provider: StorageProvider;
	local: {
		basePath: string;
	};
	s3: {
		bucket: string;
		region: string;
		accessKeyId: string;
		secretAccessKey: string;
		endpoint: string;
		forcePathStyle: boolean;
	};
}

export interface SaveOrganizationStorageSettingsInput {
	organizationId: string;
	enabled: boolean;
	provider: StorageProvider;
	localBasePath?: string;
	s3Bucket?: string;
	s3Region?: string;
	s3AccessKeyId?: string;
	s3SecretAccessKey?: string;
	s3Endpoint?: string;
	s3ForcePathStyle?: boolean;
}

export interface SaveOrganizationStorageSettingsResult {
	success: boolean;
	fieldErrors?: Record<string, string>;
}

const DEFAULT_STORAGE_SETTINGS: OrganizationStorageSettings = {
	enabled: false,
	provider: 'local',
	local: {
		basePath: '',
	},
	s3: {
		bucket: '',
		region: '',
		accessKeyId: '',
		secretAccessKey: '',
		endpoint: '',
		forcePathStyle: false,
	},
};

function toStorageSettings(storageConfigValue: StorageConfig): OrganizationStorageSettings {
	if (storageConfigValue.provider === 's3') {
		return {
			enabled: true,
			provider: 's3',
			local: { basePath: '' },
			s3: {
				bucket: storageConfigValue.bucket,
				region: storageConfigValue.region,
				accessKeyId: storageConfigValue.accessKeyId,
				secretAccessKey: storageConfigValue.secretAccessKey,
				endpoint: storageConfigValue.endpoint ?? '',
				forcePathStyle: storageConfigValue.forcePathStyle ?? false,
			},
		};
	}

	return {
		enabled: true,
		provider: 'local',
		local: {
			basePath: storageConfigValue.basePath,
		},
		s3: { ...DEFAULT_STORAGE_SETTINGS.s3 },
	};
}

function validateStorageSettings(input: SaveOrganizationStorageSettingsInput): Record<string, string> {
	const fieldErrors: Record<string, string> = {};
	if (!input.enabled) {
		return fieldErrors;
	}
	if (input.provider === 'local') {
		if (!input.localBasePath?.trim()) {
			fieldErrors.storageLocalBasePath = 'Base path is required';
		}
		return fieldErrors;
	}
	if (!input.s3Bucket?.trim()) {
		fieldErrors.storageS3Bucket = 'Bucket is required';
	}
	if (!input.s3Region?.trim()) {
		fieldErrors.storageS3Region = 'Region is required';
	}
	if (!input.s3AccessKeyId?.trim()) {
		fieldErrors.storageS3AccessKeyId = 'Access key is required';
	}
	if (!input.s3SecretAccessKey?.trim()) {
		fieldErrors.storageS3SecretAccessKey = 'Secret key is required';
	}
	return fieldErrors;
}

function buildStorageConfig(input: SaveOrganizationStorageSettingsInput): LocalStorageConfig | S3StorageConfig {
	if (input.provider === 'local') {
		return {
			provider: 'local',
			basePath: input.localBasePath?.trim() ?? '',
		};
	}
	return {
		provider: 's3',
		bucket: input.s3Bucket?.trim() ?? '',
		region: input.s3Region?.trim() ?? '',
		accessKeyId: input.s3AccessKeyId?.trim() ?? '',
		secretAccessKey: input.s3SecretAccessKey?.trim() ?? '',
		endpoint: input.s3Endpoint?.trim() || undefined,
		forcePathStyle: input.s3ForcePathStyle ?? false,
	};
}

export async function getOrganizationStorageSettings(organizationId: string): Promise<OrganizationStorageSettings> {
	const storedConfig = await db.query.storageConfig.findFirst({
		where: eq(storageConfig.organizationId, organizationId),
	});
	if (!storedConfig) {
		return {
			...DEFAULT_STORAGE_SETTINGS,
			local: { ...DEFAULT_STORAGE_SETTINGS.local },
			s3: { ...DEFAULT_STORAGE_SETTINGS.s3 },
		};
	}
	return toStorageSettings(JSON.parse(decrypt(storedConfig.config)) as StorageConfig);
}

export async function saveOrganizationStorageSettings(
	input: SaveOrganizationStorageSettingsInput
): Promise<SaveOrganizationStorageSettingsResult> {
	const fieldErrors = validateStorageSettings(input);
	if (Object.keys(fieldErrors).length > 0) {
		return { success: false, fieldErrors };
	}

	if (!input.enabled) {
		await db.delete(storageConfig).where(eq(storageConfig.organizationId, input.organizationId));
		invalidateStorageAdapterCache(input.organizationId);
		return { success: true };
	}

	const values = {
		organizationId: input.organizationId,
		provider: input.provider,
		config: encrypt(JSON.stringify(buildStorageConfig(input))),
	};

	await db
		.insert(storageConfig)
		.values(values)
		.onConflictDoUpdate({ target: storageConfig.organizationId, set: values });

	invalidateStorageAdapterCache(input.organizationId);
	return { success: true };
}

export async function testOrganizationStorageSettings(input: SaveOrganizationStorageSettingsInput): Promise<void> {
	const fieldErrors = validateStorageSettings(input);
	if (Object.keys(fieldErrors).length > 0) {
		throw new Error('Storage settings are invalid');
	}
	if (!input.enabled) {
		await new LocalStorageAdapter({
			provider: 'local',
			basePath: config.paths.data,
		}).testConnection();
		return;
	}
	const storageConfigValue = buildStorageConfig(input);
	const adapter =
		storageConfigValue.provider === 's3'
			? new S3StorageAdapter(storageConfigValue)
			: new LocalStorageAdapter(storageConfigValue);
	await adapter?.testConnection();
}
