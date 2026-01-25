/**
 * Jackett API Client
 *
 * Searches for torrents across multiple indexers via Jackett.
 * Filters for high-quality releases from trusted groups (YTS, YIFY, BONE).
 */

import { config } from '$lib/config';

/**
 * Jackett search result
 */
export interface JackettResult {
	title: string;
	magnetUri: string;
	infohash: string;
	size: number;
	seeders: number;
	peers: number;
	publishDate: string;
}

/**
 * Raw Jackett API response
 */
interface JackettApiResponse {
	Results: Array<{
		Title: string;
		MagnetUri: string | null;
		InfoHash: string | null;
		Size: number;
		Seeders: number;
		Peers: number;
		PublishDate: string;
	}>;
}

/**
 * Quality patterns to reject (low quality releases)
 */
const LOW_QUALITY_PATTERNS = [
	/\bCAM\b/i,
	/\bHDCAM\b/i,
	/\bTS\b/i,
	/\bTELESYNC\b/i,
	/\bHDTS\b/i,
	/\bSCR\b/i,
	/\bSCREENER\b/i,
	/\bDVDSCR\b/i,
	/\bR5\b/i,
	/\bTC\b/i,
	/\bTELECINE\b/i,
];

/**
 * Quality scoring for sorting (higher is better)
 * Keys are uppercase to match extractQuality output
 */
const QUALITY_SCORES: Record<string, number> = {
	// '2160P': 100,
	'1080P': 100,
	UHD: 80,
	'720P': 60,
	'4K': 40,
};

/**
 * Pattern to extract quality from title
 */
const QUALITY_PATTERN = /\b(2160p|4K|UHD|1080p|720p|480p)\b/i;

/**
 * Pattern to extract release group from title
 */
const RELEASE_GROUP_PATTERN = /-([A-Za-z0-9]+)(?:\[.*\])?$/;

/**
 * Parse Jackett API response into typed results
 */
export function parseJackettResults(response: JackettApiResponse): JackettResult[] {
	if (!(response.Results && Array.isArray(response.Results))) {
		return [];
	}

	return response.Results.filter((r) => r.MagnetUri && r.InfoHash).map((r) => ({
		title: r.Title,
		magnetUri: r.MagnetUri as string,
		infohash: (r.InfoHash as string).toLowerCase(),
		size: r.Size,
		seeders: r.Seeders,
		peers: r.Peers,
		publishDate: r.PublishDate,
	}));
}

/**
 * Filter results by trusted release groups
 */
export function filterByReleaseGroup(results: JackettResult[], trustedGroups: string[]): JackettResult[] {
	if (trustedGroups.length === 0) {
		return results;
	}

	return results.filter((result) => {
		const title = result.title.toUpperCase();
		return trustedGroups.some((group) => title.includes(group.toUpperCase()));
	});
}

/**
 * Filter out low quality releases (CAM, TS, etc.)
 */
export function filterByQuality(results: JackettResult[]): JackettResult[] {
	return results.filter((result) => {
		return !LOW_QUALITY_PATTERNS.some((pattern) => pattern.test(result.title));
	});
}

/**
 * Extract quality from title (e.g., "1080p", "2160p")
 */
function extractQuality(title: string): string | null {
	const match = title.match(QUALITY_PATTERN);
	return match ? match[1].toUpperCase() : null;
}

/**
 * Calculate score for a torrent result
 * Considers quality and seeders
 */
function calculateScore(result: JackettResult): number {
	const quality = extractQuality(result.title);
	const qualityScore = quality ? QUALITY_SCORES[quality] || 0 : 0;

	// Seeders score (logarithmic to not overweight very high seeder counts)
	const seederScore = Math.log10(result.seeders + 1) * 20;

	return qualityScore + seederScore;
}

/**
 * Select the best torrent from results
 * Prioritizes quality and seeders
 */
export function selectBestTorrent(results: JackettResult[]): JackettResult | null {
	if (results.length === 0) {
		return null;
	}

	// Sort by score descending
	const sorted = [...results].sort((a, b) => {
		const scoreA = calculateScore(a);
		const scoreB = calculateScore(b);
		return scoreB - scoreA;
	});

	return sorted[0];
}

/**
 * Search Jackett for torrents by IMDB ID
 */
export async function searchJackett(imdbId: string): Promise<JackettResult[]> {
	const { url, apiKey } = config.jackett;

	if (!apiKey) {
		console.error('Jackett API key not configured');
		return [];
	}

	const params = new URLSearchParams({
		apikey: apiKey,
		Query: `imdb:${imdbId}`,
	});

	try {
		const response = await fetch(`${url}/api/v2.0/indexers/all/results?${params}`, {
			headers: { Accept: 'application/json' },
		});

		if (!response.ok) {
			console.error(`Jackett search failed: ${response.status} ${response.statusText}`);
			return [];
		}

		const data: JackettApiResponse = await response.json();

		return parseJackettResults(data);
	} catch (error) {
		console.error('Jackett search error:', error);
		return [];
	}
}

/**
 * Search and filter Jackett results for high-quality torrents
 * Returns the best matching torrent or null
 */
export async function findBestTorrent(imdbId: string): Promise<JackettResult | null> {
	const results = await searchJackett(imdbId);

	if (results.length === 0) {
		return null;
	}

	// Filter by quality (remove CAM, TS, etc.)
	const qualityFiltered = filterByQuality(results);

	// Filter by trusted release groups
	const groupFiltered = filterByReleaseGroup(qualityFiltered, config.jackett.trustedGroups);

	// If we have trusted group results, use those
	// Otherwise fall back to quality-filtered results
	const candidates = groupFiltered.length > 0 ? groupFiltered : qualityFiltered;

	// Filter by minimum seeders
	const seederFiltered = candidates.filter((r) => r.seeders >= config.jackett.minSeeders);

	// Select the best torrent
	return selectBestTorrent(seederFiltered.length > 0 ? seederFiltered : candidates);
}

/**
 * Extract quality and release group from torrent title
 */
export function parseTorrentTitle(title: string): {
	quality: string | null;
	releaseGroup: string | null;
} {
	const quality = extractQuality(title);

	// Extract release group (usually at the end after a hyphen)
	const groupMatch = title.match(RELEASE_GROUP_PATTERN);
	const releaseGroup = groupMatch ? groupMatch[1] : null;

	return { quality, releaseGroup };
}

// =============================================================================
// TV Season Search
// =============================================================================

/**
 * Patterns that indicate a single episode (to exclude from season pack results)
 */
const SINGLE_EPISODE_PATTERNS = [
	/\bE\d{1,3}\b/i, // E01, E12, etc.
	/\d{1,2}x\d{1,3}/i, // 1x01, 12x05, etc.
	/\bEpisode\s*\d+/i, // Episode 1, Episode 12, etc.
	/S\d{1,2}E\d{1,3}/i, // S01E01 (full pattern)
	/S\d{1,2}\s+E\d{1,3}/i, // S01 E01 (with space)
];

/**
 * Patterns that indicate a season pack
 */
const SEASON_PACK_PATTERNS = [
	/\bS\d{1,2}\b(?!E)/i, // S01, S02 (not followed by E)
	/\bSeason[\s.]*\d+\b/i, // Season 1, Season.1
	/\bComplete\b/i, // Complete
	/\bFull[\s.]*Season\b/i, // Full Season
];

/**
 * Minimum size for a season pack (in bytes) - approximately 1GB
 * This helps filter out single episodes that might slip through
 */
const MIN_SEASON_PACK_SIZE = 1 * 1024 * 1024 * 1024; // 1GB

/**
 * Check if a title matches a specific season number
 */
function matchesSeasonNumber(title: string, seasonNumber: number): boolean {
	const paddedSeason = seasonNumber.toString().padStart(2, '0');
	const patterns = [
		new RegExp(`\\bS${paddedSeason}\\b`, 'i'), // S01, S02
		new RegExp(`\\bS${seasonNumber}\\b`, 'i'), // S1, S2 (without padding)
		new RegExp(`\\bSeason[\\s.]*${seasonNumber}\\b`, 'i'), // Season 1, Season.1
	];
	return patterns.some((pattern) => pattern.test(title));
}

/**
 * Check if a title is a single episode (not a season pack)
 */
function isSingleEpisode(title: string): boolean {
	return SINGLE_EPISODE_PATTERNS.some((pattern) => pattern.test(title));
}

/**
 * Check if a title looks like a season pack
 */
function isSeasonPack(title: string): boolean {
	return SEASON_PACK_PATTERNS.some((pattern) => pattern.test(title));
}

/**
 * Filter results to only season packs for a specific season
 */
export function filterForSeasonPacks(results: JackettResult[], seasonNumber: number): JackettResult[] {
	return results.filter((result) => {
		const title = result.title;

		// Must match the season number
		if (!matchesSeasonNumber(title, seasonNumber)) {
			return false;
		}

		// Exclude single episodes
		if (isSingleEpisode(title)) {
			return false;
		}

		// Prefer results that look like season packs or are large enough
		const looksLikeSeasonPack = isSeasonPack(title);
		const isLargeEnough = result.size >= MIN_SEASON_PACK_SIZE;

		return looksLikeSeasonPack || isLargeEnough;
	});
}

/**
 * Search Jackett for TV show season packs by title and season number
 */
export async function searchSeasonTorrent(
	showTitle: string,
	seasonNumber: number,
	imdbId?: string
): Promise<JackettResult[]> {
	const { url, apiKey } = config.jackett;

	if (!apiKey) {
		console.error('Jackett API key not configured');
		return [];
	}

	// Format season number with padding
	const paddedSeason = seasonNumber.toString().padStart(2, '0');

	// Build search queries - try IMDB ID first if available, then title-based
	const searchQueries: string[] = [];

	if (imdbId) {
		searchQueries.push(`imdb:${imdbId} S${paddedSeason}`);
	}

	// Title-based searches
	searchQueries.push(`${showTitle} S${paddedSeason}`);
	searchQueries.push(`${showTitle} Season ${seasonNumber}`);

	const allResults: JackettResult[] = [];
	const seenInfohashes = new Set<string>();

	for (const query of searchQueries) {
		const params = new URLSearchParams({
			apikey: apiKey,
			Query: query,
		});

		try {
			const response = await fetch(`${url}/api/v2.0/indexers/all/results?${params}`, {
				headers: { Accept: 'application/json' },
			});

			if (!response.ok) {
				console.error(`Jackett season search failed for "${query}": ${response.status}`);
				continue;
			}

			const data: JackettApiResponse = await response.json();
			const results = parseJackettResults(data);

			// Deduplicate by infohash
			for (const result of results) {
				if (!seenInfohashes.has(result.infohash)) {
					seenInfohashes.add(result.infohash);
					allResults.push(result);
				}
			}
		} catch (error) {
			console.error(`Jackett season search error for "${query}":`, error);
		}

		// If we found results with IMDB search, we can skip title searches
		if (imdbId && allResults.length > 0) {
			break;
		}
	}

	return allResults;
}

/**
 * Find the best season pack torrent for a TV show season
 */
export async function findBestSeasonTorrent(
	showTitle: string,
	seasonNumber: number,
	imdbId?: string
): Promise<JackettResult | null> {
	const results = await searchSeasonTorrent(showTitle, seasonNumber, imdbId);

	if (results.length === 0) {
		return null;
	}

	// Filter by quality (remove CAM, TS, etc.)
	const qualityFiltered = filterByQuality(results);

	// Filter for season packs only
	const seasonPacks = filterForSeasonPacks(qualityFiltered, seasonNumber);

	if (seasonPacks.length === 0) {
		// Fall back to quality filtered results if no clear season packs found
		// but still exclude single episodes
		const nonEpisodes = qualityFiltered.filter(
			(r) => !isSingleEpisode(r.title) && matchesSeasonNumber(r.title, seasonNumber)
		);
		if (nonEpisodes.length > 0) {
			const seederFiltered = nonEpisodes.filter((r) => r.seeders >= config.jackett.minSeeders);
			return selectBestTorrent(seederFiltered.length > 0 ? seederFiltered : nonEpisodes);
		}
		return null;
	}

	// Filter by minimum seeders
	const seederFiltered = seasonPacks.filter((r) => r.seeders >= config.jackett.minSeeders);

	// Select the best torrent
	return selectBestTorrent(seederFiltered.length > 0 ? seederFiltered : seasonPacks);
}
