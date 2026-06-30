import { eq } from "drizzle-orm";
import { config as envConfig } from "$lib/config";
import { decrypt, encrypt } from "$lib/server/crypto";
import { db } from "$lib/server/db/index";
import { configuration } from "$lib/server/db/schema";

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

/** Fields stored encrypted at rest */
const ENCRYPTED_FIELDS = [
	"tmdbApiKey",
	"prowlarrApiKey",
	"opensubtitlesApiKey",
	"opensubtitlesUsername",
	"opensubtitlesPassword",
] as const;

/** Fields stored as plain text (or serialized JSON) */
const PLAIN_FIELDS = ["prowlarrUrl", "prowlarrMinSeeders"] as const;

type SettingsUpdate = Partial<{
	tmdbApiKey: string;
	prowlarrUrl: string;
	prowlarrApiKey: string;
	prowlarrTrustedGroups: string[];
	prowlarrMinSeeders: number;
	opensubtitlesApiKey: string;
	opensubtitlesUsername: string;
	opensubtitlesPassword: string;
}>;

// In-memory cache for settings to avoid repeated DB queries + decryption
// TODO: I worry this cache will leak the users data to other clients. Will need to look into this
let settingsCache: AppSettings | null = null;
let settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 60_000; // 1 minute

export async function getSettings(): Promise<AppSettings> {
	// Return cached settings if still fresh
	const now = Date.now();
	if (settingsCache && now - settingsCacheTime < SETTINGS_CACHE_TTL) {
		return settingsCache;
	}

	try {
		// Try to get from DB
		const stored = await db.query.configuration.findFirst({
			where: eq(configuration.id, "default"),
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

		const settings: AppSettings = {
			tmdb: {
				apiKey: decrypt(stored?.tmdbApiKey || "") || envConfig.tmdb.apiKey,
				baseUrl: envConfig.tmdb.baseUrl,
				imageBaseUrl: envConfig.tmdb.imageBaseUrl,
				language: "en-US",
			},
			prowlarr: {
				url: stored?.prowlarrUrl || envConfig.prowlarr.url,
				apiKey: decrypt(stored?.prowlarrApiKey || "") || envConfig.prowlarr.apiKey,
				trustedGroups,
				minSeeders: stored?.prowlarrMinSeeders ?? envConfig.prowlarr.minSeeders,
			},
			opensubtitles: {
				apiKey: decrypt(stored?.opensubtitlesApiKey || "") || envConfig.opensubtitles.apiKey,
				username: decrypt(stored?.opensubtitlesUsername || "") || envConfig.opensubtitles.username,
				password: decrypt(stored?.opensubtitlesPassword || "") || envConfig.opensubtitles.password,
			},
		};

		settingsCache = settings;
		settingsCacheTime = now;
		return settings;
	} catch (e) {
		console.error("Failed to load settings from DB, falling back to env:", e);
		return {
			tmdb: {
				...envConfig.tmdb,
				language: "en-US",
			},
			prowlarr: envConfig.prowlarr,
			opensubtitles: envConfig.opensubtitles,
		};
	}
}

/** Invalidate the settings cache (call after updateSettings) */
function invalidateSettingsCache(): void {
	settingsCache = null;
	settingsCacheTime = 0;
}

export async function updateSettings(updates: SettingsUpdate) {
	const values: Partial<typeof configuration.$inferInsert> = {};

	for (const field of ENCRYPTED_FIELDS) {
		if (updates[field] !== undefined) {
			values[field] = updates[field] ? encrypt(updates[field] as string) : "";
		}
	}

	for (const field of PLAIN_FIELDS) {
		if (updates[field] !== undefined) {
			(values as Record<string, unknown>)[field] = updates[field];
		}
	}

	if (updates.prowlarrTrustedGroups !== undefined) {
		values.prowlarrTrustedGroups = JSON.stringify(updates.prowlarrTrustedGroups);
	}

	await db
		.insert(configuration)
		.values({ id: "default", ...values })
		.onConflictDoUpdate({ target: configuration.id, set: values });

	invalidateSettingsCache();
}
