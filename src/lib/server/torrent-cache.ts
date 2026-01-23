/**
 * Torrent Cache Service
 *
 * Manages the cache of IMDB ID to magnet link mappings.
 * Used to avoid repeated Jackett queries for the same content.
 */

import { eq } from 'drizzle-orm';
import { db } from './db/index';
import { torrentCache } from './db/schema';

/**
 * Cached torrent data
 */
export interface CachedTorrent {
	imdbId: string;
	tmdbId?: number;
	magnetLink: string;
	infohash: string;
	title: string;
	quality?: string;
	releaseGroup?: string;
	size?: number;
	seeders?: number;
}

/**
 * Get cached torrent by IMDB ID
 */
export async function getCachedTorrent(imdbId: string): Promise<CachedTorrent | null> {
	const result = await db
		.select()
		.from(torrentCache)
		.where(eq(torrentCache.imdbId, imdbId))
		.limit(1);

	if (result.length === 0) {
		return null;
	}

	const row = result[0];
	return {
		imdbId: row.imdbId,
		tmdbId: row.tmdbId ?? undefined,
		magnetLink: row.magnetLink,
		infohash: row.infohash,
		title: row.title,
		quality: row.quality ?? undefined,
		releaseGroup: row.releaseGroup ?? undefined,
		size: row.size ?? undefined,
		seeders: row.seeders ?? undefined,
	};
}

/**
 * Get cached torrents for multiple IMDB IDs
 */
export async function getCachedTorrents(imdbIds: string[]): Promise<Map<string, CachedTorrent>> {
	if (imdbIds.length === 0) {
		return new Map();
	}

	const results = await db.select().from(torrentCache);

	const map = new Map<string, CachedTorrent>();
	for (const row of results) {
		if (imdbIds.includes(row.imdbId)) {
			map.set(row.imdbId, {
				imdbId: row.imdbId,
				tmdbId: row.tmdbId ?? undefined,
				magnetLink: row.magnetLink,
				infohash: row.infohash,
				title: row.title,
				quality: row.quality ?? undefined,
				releaseGroup: row.releaseGroup ?? undefined,
				size: row.size ?? undefined,
				seeders: row.seeders ?? undefined,
			});
		}
	}

	return map;
}

/**
 * Save torrent to cache
 */
export async function cacheTorrent(torrent: CachedTorrent): Promise<void> {
	const id = crypto.randomUUID();

	await db
		.insert(torrentCache)
		.values({
			id,
			imdbId: torrent.imdbId,
			tmdbId: torrent.tmdbId,
			magnetLink: torrent.magnetLink,
			infohash: torrent.infohash,
			title: torrent.title,
			quality: torrent.quality,
			releaseGroup: torrent.releaseGroup,
			size: torrent.size,
			seeders: torrent.seeders,
		})
		.onConflictDoUpdate({
			target: torrentCache.imdbId,
			set: {
				magnetLink: torrent.magnetLink,
				infohash: torrent.infohash,
				title: torrent.title,
				quality: torrent.quality,
				releaseGroup: torrent.releaseGroup,
				size: torrent.size,
				seeders: torrent.seeders,
				updatedAt: new Date(),
			},
		});
}

/**
 * Delete cached torrent by IMDB ID
 */
export async function deleteCachedTorrent(imdbId: string): Promise<void> {
	await db.delete(torrentCache).where(eq(torrentCache.imdbId, imdbId));
}
