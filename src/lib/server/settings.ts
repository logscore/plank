import { eq } from 'drizzle-orm';
import { config as envConfig } from '$lib/config';
import { decrypt, encrypt, isEncrypted } from '$lib/server/crypto';
import { db } from '$lib/server/db/index';
import { configuration } from '$lib/server/db/schema';

export interface AppSettings {
	tmdb: {
		apiKey: string;
		baseUrl: string;
		imageBaseUrl: string;
		language: string;
	};
	prowlarr: {
		url: string;
		apiKey: string;
		trustedGroups: string[];
		minSeeders: number;
	};
	opensubtitles: {
		apiKey: string;
		username: string;
		password: string;
	};
}

/** Sensitive fields that should be encrypted at rest */
const SENSITIVE_FIELDS = [
	'tmdbApiKey',
	'prowlarrApiKey',
	'opensubtitlesApiKey',
	'opensubtitlesUsername',
	'opensubtitlesPassword',
] as const;

/** Decrypt a stored value, returning empty string for nullish values */
function decryptField(value: string | null | undefined): string {
	if (!value) {
		return '';
	}
	return decrypt(value);
}

/**
 * Migrate unencrypted values to encrypted on read.
 * If any sensitive field is stored as plaintext, re-encrypt and persist it.
 */
async function migrateUnencryptedFields(stored: typeof configuration.$inferSelect): Promise<void> {
	const updates: Partial<typeof configuration.$inferInsert> = {};
	let needsMigration = false;

	for (const field of SENSITIVE_FIELDS) {
		const value = stored[field];
		if (value && !isEncrypted(value)) {
			updates[field] = encrypt(value);
			needsMigration = true;
		}
	}

	if (needsMigration) {
		await db.update(configuration).set(updates).where(eq(configuration.id, 'default'));
	}
}

export async function getSettings(): Promise<AppSettings> {
	try {
		// Try to get from DB
		const stored = await db.query.configuration.findFirst({
			where: eq(configuration.id, 'default'),
		});

		// Transparently migrate any plaintext credentials to encrypted
		if (stored) {
			await migrateUnencryptedFields(stored);
		}

		// Default trusted groups from env config
		const defaultTrustedGroups = envConfig.prowlarr.trustedGroups;

		// Parse trusted groups if stored
		let trustedGroups = defaultTrustedGroups;
		if (stored?.prowlarrTrustedGroups) {
			try {
				const parsed = JSON.parse(stored.prowlarrTrustedGroups);
				if (Array.isArray(parsed)) {
					trustedGroups = parsed;
				}
			} catch {
				// keep default
			}
		}

		return {
			tmdb: {
				apiKey: decryptField(stored?.tmdbApiKey) || envConfig.tmdb.apiKey,
				baseUrl: envConfig.tmdb.baseUrl,
				imageBaseUrl: envConfig.tmdb.imageBaseUrl,
				language: 'en-US',
			},
			prowlarr: {
				url: stored?.prowlarrUrl || envConfig.prowlarr.url,
				apiKey: decryptField(stored?.prowlarrApiKey) || envConfig.prowlarr.apiKey,
				trustedGroups,
				minSeeders: stored?.prowlarrMinSeeders ?? envConfig.prowlarr.minSeeders,
			},
			opensubtitles: {
				apiKey: decryptField(stored?.opensubtitlesApiKey) || envConfig.opensubtitles.apiKey,
				username: decryptField(stored?.opensubtitlesUsername) || envConfig.opensubtitles.username,
				password: decryptField(stored?.opensubtitlesPassword) || envConfig.opensubtitles.password,
			},
		};
	} catch (e) {
		console.error('Failed to load settings from DB, falling back to env:', e);
		return {
			tmdb: {
				...envConfig.tmdb,
				language: 'en-US',
			},
			prowlarr: envConfig.prowlarr,
			opensubtitles: envConfig.opensubtitles,
		};
	}
}

export async function updateSettings(
	updates: Partial<{
		tmdbApiKey: string;
		prowlarrUrl: string;
		prowlarrApiKey: string;
		prowlarrTrustedGroups: string[];
		prowlarrMinSeeders: number;
		opensubtitlesApiKey: string;
		opensubtitlesUsername: string;
		opensubtitlesPassword: string;
	}>
) {
	const values: Partial<typeof configuration.$inferInsert> = {};

	// Encrypt sensitive fields before storing
	if (updates.tmdbApiKey !== undefined) {
		values.tmdbApiKey = updates.tmdbApiKey ? encrypt(updates.tmdbApiKey) : '';
	}
	if (updates.prowlarrUrl !== undefined) {
		values.prowlarrUrl = updates.prowlarrUrl;
	}
	if (updates.prowlarrApiKey !== undefined) {
		values.prowlarrApiKey = updates.prowlarrApiKey ? encrypt(updates.prowlarrApiKey) : '';
	}
	if (updates.prowlarrTrustedGroups !== undefined) {
		values.prowlarrTrustedGroups = JSON.stringify(updates.prowlarrTrustedGroups);
	}
	if (updates.prowlarrMinSeeders !== undefined) {
		values.prowlarrMinSeeders = updates.prowlarrMinSeeders;
	}
	if (updates.opensubtitlesApiKey !== undefined) {
		values.opensubtitlesApiKey = updates.opensubtitlesApiKey ? encrypt(updates.opensubtitlesApiKey) : '';
	}
	if (updates.opensubtitlesUsername !== undefined) {
		values.opensubtitlesUsername = updates.opensubtitlesUsername ? encrypt(updates.opensubtitlesUsername) : '';
	}
	if (updates.opensubtitlesPassword !== undefined) {
		values.opensubtitlesPassword = updates.opensubtitlesPassword ? encrypt(updates.opensubtitlesPassword) : '';
	}

	// Upsert
	await db
		.insert(configuration)
		.values({ id: 'default', ...values })
		.onConflictDoUpdate({
			target: configuration.id,
			set: values,
		});
}
