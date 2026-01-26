import { eq } from 'drizzle-orm';
import { config as envConfig } from '$lib/config';
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
}

export async function getSettings(): Promise<AppSettings> {
	try {
		// Try to get from DB
		const stored = await db.query.configuration.findFirst({
			where: eq(configuration.id, 'default'),
		});

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
				apiKey: stored?.tmdbApiKey || envConfig.tmdb.apiKey,
				baseUrl: envConfig.tmdb.baseUrl,
				imageBaseUrl: envConfig.tmdb.imageBaseUrl,
				language: stored?.tmdbLanguage || 'en-US',
			},
			prowlarr: {
				url: stored?.prowlarrUrl || envConfig.prowlarr.url,
				apiKey: stored?.prowlarrApiKey || envConfig.prowlarr.apiKey,
				trustedGroups,
				minSeeders: stored?.prowlarrMinSeeders ?? envConfig.prowlarr.minSeeders,
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
		};
	}
}

export async function updateSettings(
	updates: Partial<{
		tmdbApiKey: string;
		tmdbLanguage: string;
		prowlarrUrl: string;
		prowlarrApiKey: string;
		prowlarrTrustedGroups: string[];
		prowlarrMinSeeders: number;
	}>
) {
	const values: Partial<typeof configuration.$inferInsert> = {};
	if (updates.tmdbApiKey !== undefined) {
		values.tmdbApiKey = updates.tmdbApiKey;
	}
	if (updates.tmdbLanguage !== undefined) {
		values.tmdbLanguage = updates.tmdbLanguage;
	}
	if (updates.prowlarrUrl !== undefined) {
		values.prowlarrUrl = updates.prowlarrUrl;
	}
	if (updates.prowlarrApiKey !== undefined) {
		values.prowlarrApiKey = updates.prowlarrApiKey;
	}
	if (updates.prowlarrTrustedGroups !== undefined) {
		values.prowlarrTrustedGroups = JSON.stringify(updates.prowlarrTrustedGroups);
	}
	if (updates.prowlarrMinSeeders !== undefined) {
		values.prowlarrMinSeeders = updates.prowlarrMinSeeders;
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
