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
	'2160P': 100,
	'4K': 100,
	UHD: 100,
	'1080P': 80,
	'720P': 60,
	'480P': 40,
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

	console.log(sorted);

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

		console.log(data);

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

	console.log('Results: ', results);

	if (results.length === 0) {
		return null;
	}

	// Filter by quality (remove CAM, TS, etc.)
	const qualityFiltered = filterByQuality(results);

	console.log(qualityFiltered);

	// Filter by trusted release groups
	const groupFiltered = filterByReleaseGroup(qualityFiltered, config.jackett.trustedGroups);

	console.log(groupFiltered);

	// If we have trusted group results, use those
	// Otherwise fall back to quality-filtered results
	const candidates = groupFiltered.length > 0 ? groupFiltered : qualityFiltered;

	console.log(candidates);

	// Filter by minimum seeders
	const seederFiltered = candidates.filter((r) => r.seeders >= config.jackett.minSeeders);

	console.log(seederFiltered);

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
