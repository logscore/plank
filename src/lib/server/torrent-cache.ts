/**
 * Torrent Cache Service
 *
 * Manages the cache of IMDB ID to magnet link mappings.
 * Used to avoid repeated Prowlarr queries for the same content.
 */

import { eq, inArray } from "drizzle-orm";
import { db } from "./db/index";
import { torrentCache } from "./db/schema";

/**
 * Cached torrent data
 */
export type CachedTorrent = typeof torrentCache.$inferSelect;

/**
 * Get cached torrent by IMDB ID
 */
export async function getCachedTorrent(imdbId: string): Promise<CachedTorrent | null> {
	const [row] = await db.select().from(torrentCache).where(eq(torrentCache.imdbId, imdbId)).limit(1);
	return row ?? null;
}

/**
 * Get cached torrents for multiple IMDB IDs
 */
export async function getCachedTorrents(imdbIds: string[]): Promise<Map<string, CachedTorrent>> {
	if (imdbIds.length === 0) {
		return new Map();
	}

	const results = await db.select().from(torrentCache).where(inArray(torrentCache.imdbId, imdbIds));

	const map = new Map<string, CachedTorrent>();
	for (const row of results) {
		map.set(row.imdbId, row);
	}

	return map;
}

/**
 * Save torrent to cache
 */
export async function cacheTorrent(torrent: CachedTorrent): Promise<void> {
	await db
		.insert(torrentCache)
		.values(torrent)
		.onConflictDoUpdate({
			target: torrentCache.imdbId,
			set: {
				magnetLink: torrent.magnetLink,
				infohash: torrent.infohash,
			},
		});
}
