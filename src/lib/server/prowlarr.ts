/**
 * Prowlarr API Client
 *
 * Searches for torrents across multiple indexers via Prowlarr.
 * Filters for high-quality releases from trusted groups.
 */

import parseTorrent from 'parse-torrent';
import { getSettings } from '$lib/server/settings';

/**
 * Standardized Indexer search result
 */
export interface IndexerResult {
	title: string;
	magnetUri: string;
	infohash: string;
	size: number;
	seeders: number;
	peers: number;
	publishDate: string;
	indexer: string;
}

/**
 * Raw Prowlarr API response item
 */
interface ProwlarrResultItem {
	title: string;
	magnetUrl?: string;
	downloadUrl?: string;
	infoHash?: string;
	size: number;
	seeders?: number;
	leechers?: number;
	publishDate: string;
	indexer?: string;
	guid: string;
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
	'2160P': 110,
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
 * Parse Prowlarr API response into typed results
 * Accepts both magnet links and HTTP download URLs (which will be resolved later)
 */
export function parseProwlarrResults(results: ProwlarrResultItem[]): IndexerResult[] {
	if (!Array.isArray(results)) {
		return [];
	}

	return results
		.filter((r) => {
			// Accept magnetUrl, or downloadUrl (either magnet: or http: - we'll resolve HTTP later)
			const hasLink = r.magnetUrl || r.downloadUrl;
			// infoHash is required for deduplication and identification
			return hasLink && r.infoHash;
		})
		.map((r) => ({
			title: r.title,
			// Prefer magnetUrl, fall back to downloadUrl (which may be HTTP and resolved later)
			magnetUri: (r.magnetUrl || r.downloadUrl) as string,
			infohash: (r.infoHash as string).toLowerCase(),
			size: r.size,
			seeders: r.seeders || 0,
			peers: (r.seeders || 0) + (r.leechers || 0),
			publishDate: r.publishDate,
			indexer: r.indexer || 'Unknown',
		}));
}

/**
 * Filter results by trusted release groups
 */
export function filterByReleaseGroup(results: IndexerResult[], trustedGroups: string[]): IndexerResult[] {
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
export function filterByQuality(results: IndexerResult[]): IndexerResult[] {
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
function calculateScore(result: IndexerResult): number {
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
export function selectBestTorrent(results: IndexerResult[]): IndexerResult | null {
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
 * Check if hostname is localhost
 */
function isLocalhost(hostname: string): boolean {
	return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Try to extract magnet from response body (torrent file or text)
 */
function extractMagnetFromBody(buffer: ArrayBuffer, contentType: string): string | null {
	// Check if it's a torrent file
	if (contentType.includes('torrent') || contentType.includes('octet-stream')) {
		const parsed = parseTorrent(Buffer.from(buffer));
		if (parsed?.infoHash) {
			// @ts-expect-error - types missing for toMagnetURI
			return parseTorrent.toMagnetURI(parsed);
		}
	}

	// Check if the body itself is a magnet link (text response)
	if (buffer.byteLength < 1000) {
		const text = new TextDecoder().decode(buffer).trim();
		if (text.startsWith('magnet:')) {
			return text;
		}
	}

	return null;
}

/**
 * Handle redirect response, returning magnet link or recursively following HTTP redirects
 */
async function handleRedirect(
	response: Response,
	tryFetch: (url: string) => Promise<string | null>
): Promise<string | null> {
	const location = response.headers.get('location');
	if (!location) {
		return null;
	}

	if (location.startsWith('magnet:')) {
		return location;
	}

	if (location.startsWith('http')) {
		return tryFetch(location);
	}

	return null;
}

/**
 * Attempt to fetch and resolve a magnet link from a URL
 */
async function tryFetchMagnet(fetchUrl: string): Promise<string | null> {
	try {
		// Use redirect: 'manual' to capture magnet: redirects (Node's fetch can't follow non-HTTP)
		const response = await fetch(fetchUrl, {
			redirect: 'manual',
			headers: { 'User-Agent': 'Plank/1.0' },
		});

		// Handle redirects (3xx status)
		const isRedirect = response.status >= 300 && response.status < 400;
		if (isRedirect) {
			return handleRedirect(response, tryFetchMagnet);
		}

		if (!response.ok) {
			return null;
		}

		// Parse response body for magnet
		const contentType = response.headers.get('content-type') || '';
		const buffer = await response.arrayBuffer();
		return extractMagnetFromBody(buffer, contentType);
	} catch {
		return null;
	}
}

/**
 * Rewrite URL to use configured Prowlarr host (for Docker scenarios)
 */
async function rewriteUrlForConfig(url: string): Promise<string> {
	try {
		const settings = await getSettings();
		const targetUrl = new URL(url);
		const configUrl = new URL(settings.prowlarr.url);

		// If target is localhost but config uses a different host, rewrite
		if (isLocalhost(targetUrl.hostname) && !isLocalhost(configUrl.hostname)) {
			targetUrl.protocol = configUrl.protocol;
			targetUrl.hostname = configUrl.hostname;
			if (configUrl.port) {
				targetUrl.port = configUrl.port;
			}
			return targetUrl.toString();
		}
	} catch {
		// Ignore URL parsing errors
	}
	return url;
}

/**
 * Resolves a result's magnet URI if it's an HTTP URL (likely a download link from Prowlarr).
 * Prowlarr typically redirects to a magnet: URL, so we capture the redirect location.
 * If it returns a .torrent file instead, we parse it to extract the magnet link.
 */
export async function resolveMagnetLink(url: string): Promise<string> {
	if (url.startsWith('magnet:')) {
		return url;
	}

	// Try with rewritten URL (for Docker scenarios)
	const primaryUrl = await rewriteUrlForConfig(url);
	const primaryResult = await tryFetchMagnet(primaryUrl);
	if (primaryResult) {
		return primaryResult;
	}

	// Fallback: try 'prowlarr' service name for docker-compose
	try {
		const targetUrl = new URL(url);
		if (isLocalhost(targetUrl.hostname)) {
			targetUrl.hostname = 'prowlarr';
			const fallbackUrl = targetUrl.toString();

			if (fallbackUrl !== primaryUrl) {
				const fallbackResult = await tryFetchMagnet(fallbackUrl);
				if (fallbackResult) {
					return fallbackResult;
				}
			}
		}
	} catch {
		// Ignore URL parsing errors
	}

	// Return original URL if we couldn't resolve
	return url;
}

/**
 * Search Prowlarr for torrents
 */
export async function searchProwlarr(query: string, category?: string): Promise<IndexerResult[]> {
	const settings = await getSettings();
	const { url, apiKey } = settings.prowlarr;

	if (!apiKey) {
		console.error('Prowlarr API key not configured');
		return [];
	}

	const params = new URLSearchParams({
		apikey: apiKey,
		query,
		type: 'search',
	});

	if (category) {
		// Prowlarr categories: 2000=Movies, 5000=TV, etc.
		// Not strictly mapping here yet, but useful for future
		// params.append('categories', category);
	}

	try {
		// Prowlarr /api/v1/search
		const response = await fetch(`${url}/api/v1/search?${params}`, {
			headers: { Accept: 'application/json' },
		});

		if (!response.ok) {
			console.error(`Prowlarr search failed: ${response.status} ${response.statusText}`);
			return [];
		}

		const data: ProwlarrResultItem[] = await response.json();
		return parseProwlarrResults(data);
	} catch (error) {
		console.error('Prowlarr search error:', error);
		return [];
	}
}

/**
 * Search and filter Prowlarr results for high-quality torrents.
 * Returns the best matching torrent or null.
 */
export async function findBestTorrent(imdbId: string): Promise<IndexerResult | null> {
	const settings = await getSettings();
	const results = await searchProwlarr(imdbId);

	if (results.length === 0) {
		return null;
	}

	// Filter by quality (remove CAM, TS, etc.)
	const qualityFiltered = filterByQuality(results);

	// Filter by trusted release groups (fall back to all quality results if none match)
	const groupFiltered = filterByReleaseGroup(qualityFiltered, settings.prowlarr.trustedGroups);
	const candidates = groupFiltered.length > 0 ? groupFiltered : qualityFiltered;

	// Filter by minimum seeders
	const seederFiltered = candidates.filter((r) => r.seeders >= settings.prowlarr.minSeeders);

	// Select the best torrent
	const best = selectBestTorrent(seederFiltered.length > 0 ? seederFiltered : candidates);

	// Resolve HTTP download URLs to magnet links
	if (best?.magnetUri.startsWith('http')) {
		best.magnetUri = await resolveMagnetLink(best.magnetUri);
	}

	return best;
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
 * Check if a title is a single episode
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
export function filterForSeasonPacks(results: IndexerResult[], seasonNumber: number): IndexerResult[] {
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
 * Search Prowlarr for TV show season packs
 */
export async function searchSeasonTorrent(
	showTitle: string,
	seasonNumber: number,
	imdbId?: string
): Promise<IndexerResult[]> {
	const settings = await getSettings();
	const { apiKey } = settings.prowlarr;

	if (!apiKey) {
		console.error('Prowlarr API key not configured');
		return [];
	}

	// Format season number with padding
	const paddedSeason = seasonNumber.toString().padStart(2, '0');

	// Build search queries
	const searchQueries: string[] = [];

	if (imdbId) {
		searchQueries.push(`imdb:${imdbId} S${paddedSeason}`);
	}

	searchQueries.push(`${showTitle} S${paddedSeason}`);
	searchQueries.push(`${showTitle} Season ${seasonNumber}`);

	const allResults: IndexerResult[] = [];
	const seenInfohashes = new Set<string>();

	for (const query of searchQueries) {
		const results = await searchProwlarr(query);

		// Deduplicate
		for (const result of results) {
			if (!seenInfohashes.has(result.infohash)) {
				seenInfohashes.add(result.infohash);
				allResults.push(result);
			}
		}

		// If IMDB search worked, stop
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
): Promise<IndexerResult | null> {
	const settings = await getSettings();
	const results = await searchSeasonTorrent(showTitle, seasonNumber, imdbId);

	if (results.length === 0) {
		return null;
	}

	const qualityFiltered = filterByQuality(results);
	const seasonPacks = filterForSeasonPacks(qualityFiltered, seasonNumber);

	if (seasonPacks.length === 0) {
		// Fallback to non-episode files
		const nonEpisodes = qualityFiltered.filter(
			(r) => !isSingleEpisode(r.title) && matchesSeasonNumber(r.title, seasonNumber)
		);
		if (nonEpisodes.length > 0) {
			const seederFiltered = nonEpisodes.filter((r) => r.seeders >= settings.prowlarr.minSeeders);
			const best = selectBestTorrent(seederFiltered.length > 0 ? seederFiltered : nonEpisodes);

			if (best?.magnetUri.startsWith('http')) {
				best.magnetUri = await resolveMagnetLink(best.magnetUri);
			}
			return best;
		}
		return null;
	}

	const seederFiltered = seasonPacks.filter((r) => r.seeders >= settings.prowlarr.minSeeders);
	const best = selectBestTorrent(seederFiltered.length > 0 ? seederFiltered : seasonPacks);

	if (best?.magnetUri.startsWith('http')) {
		best.magnetUri = await resolveMagnetLink(best.magnetUri);
	}
	return best;
}
