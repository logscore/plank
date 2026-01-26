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
	jackett: {
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
		const defaultTrustedGroups = envConfig.jackett.trustedGroups;

		// Parse trusted groups if stored
		let trustedGroups = defaultTrustedGroups;
		if (stored?.jackettTrustedGroups) {
			try {
				const parsed = JSON.parse(stored.jackettTrustedGroups);
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
			jackett: {
				url: stored?.jackettUrl || envConfig.jackett.url,
				apiKey: stored?.jackettApiKey || envConfig.jackett.apiKey,
				trustedGroups,
				minSeeders: stored?.jackettMinSeeders ?? envConfig.jackett.minSeeders,
			},
		};
	} catch (e) {
		console.error('Failed to load settings from DB, falling back to env:', e);
		return {
			tmdb: {
				...envConfig.tmdb,
				language: 'en-US',
			},
			jackett: envConfig.jackett,
		};
	}
}

export async function updateSettings(
	updates: Partial<{
		tmdbApiKey: string;
		tmdbLanguage: string;
		jackettUrl: string;
		jackettApiKey: string;
		jackettTrustedGroups: string[];
		jackettMinSeeders: number;
	}>
) {
	const values: Partial<typeof configuration.$inferInsert> = {};
	if (updates.tmdbApiKey !== undefined) {
		values.tmdbApiKey = updates.tmdbApiKey;
	}
	if (updates.tmdbLanguage !== undefined) {
		values.tmdbLanguage = updates.tmdbLanguage;
	}
	if (updates.jackettUrl !== undefined) {
		values.jackettUrl = updates.jackettUrl;
	}
	if (updates.jackettApiKey !== undefined) {
		values.jackettApiKey = updates.jackettApiKey;
	}
	if (updates.jackettTrustedGroups !== undefined) {
		values.jackettTrustedGroups = JSON.stringify(updates.jackettTrustedGroups);
	}
	if (updates.jackettMinSeeders !== undefined) {
		values.jackettMinSeeders = updates.jackettMinSeeders;
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
