import { json } from '@sveltejs/kit';
import { and, eq, like } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { movies } from '$lib/server/db/schema';
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
		const sqlite = (db as any).$client;

		// Hybrid search: FTS5 first, then LIKE fallback
		// Explicitly select columns with camelCase aliases to match frontend types
		const results = sqlite
			.prepare(`
      SELECT 
        m.id,
        m.user_id as userId,
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
        m.added_at as addedAt,
        m.last_played_at as lastPlayedAt,
        fts.rank as fts_rank,
        1 as priority
      FROM movies_fts fts
      JOIN movies m ON fts.movie_id = m.id
      WHERE fts.user_id = ? AND movies_fts MATCH ? || '*'
      
      UNION ALL
      
      SELECT 
        m.id,
        m.user_id as userId,
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
        m.added_at as addedAt,
        m.last_played_at as lastPlayedAt,
        NULL as fts_rank,
        2 as priority
      FROM movies m
      WHERE m.user_id = ? AND m.title LIKE '%' || ? || '%'
        AND NOT EXISTS (
          SELECT 1 FROM movies_fts WHERE movie_id = m.id AND movies_fts MATCH ? || '*'
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
			.from(movies)
			.where(and(eq(movies.userId, userId), like(movies.title, `%${query}%`)))
			.limit(20)
			.all();

		return json(fallbackResults);
	}
};
