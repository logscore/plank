import { json } from '@sveltejs/kit';
import { and, eq, like } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { media } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const query = url.searchParams.get('q')?.trim() || '';

	if (query.length < 2) {
		return json([]);
	}

	const userId = locals.user.id;

	try {
		// Get underlying sqlite instance for raw FTS query
		const sqlite = (db as unknown as { $client: import('better-sqlite3').Database }).$client;

		// FTS5 content table uses rowid to reference media table
		// First try FTS search, then fall back to LIKE
		const results = sqlite
			.prepare(`
      SELECT 
        m.id,
        m.user_id as userId,
        m.type,
        m.title,
        m.year,
        m.poster_url as posterUrl,
        m.backdrop_url as backdropUrl,
        m.overview,
        m.magnet_link as magnetLink,
        m.infohash,
        m.file_path as filePath,
        m.file_size as fileSize,
        m.status,
        m.progress,
        m.tmdb_id as tmdbId,
        m.runtime,
        m.genres,
        m.original_language as originalLanguage,
        m.certification,
        m.total_seasons as totalSeasons,
        m.added_at as addedAt,
        m.last_played_at as lastPlayedAt,
        fts.rank as fts_rank,
        1 as priority
      FROM media_fts fts
      JOIN media m ON fts.rowid = m.rowid
      WHERE m.user_id = ? AND media_fts MATCH ? || '*'
      
      UNION ALL
      
      SELECT 
        m.id,
        m.user_id as userId,
        m.type,
        m.title,
        m.year,
        m.poster_url as posterUrl,
        m.backdrop_url as backdropUrl,
        m.overview,
        m.magnet_link as magnetLink,
        m.infohash,
        m.file_path as filePath,
        m.file_size as fileSize,
        m.status,
        m.progress,
        m.tmdb_id as tmdbId,
        m.runtime,
        m.genres,
        m.original_language as originalLanguage,
        m.certification,
        m.total_seasons as totalSeasons,
        m.added_at as addedAt,
        m.last_played_at as lastPlayedAt,
        NULL as fts_rank,
        2 as priority
      FROM media m
      WHERE m.user_id = ? AND m.title LIKE '%' || ? || '%'
        AND m.rowid NOT IN (
          SELECT rowid FROM media_fts WHERE media_fts MATCH ? || '*'
        )
      
      ORDER BY priority, fts_rank
      LIMIT 20
    `)
			.all(userId, query, userId, query, query);

		return json(results);
	} catch (error) {
		console.error('Search error:', error);

		// Fallback to simple LIKE search if FTS fails
		const fallbackResults = db
			.select()
			.from(media)
			.where(and(eq(media.userId, userId), like(media.title, `%${query}%`)))
			.limit(20)
			.all();

		return json(fallbackResults);
	}
};
