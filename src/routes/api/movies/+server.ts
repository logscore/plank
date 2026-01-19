import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { movies } from '$lib/server/db';
import { parseMagnet } from '$lib/server/magnet';
import { searchMovie } from '$lib/server/tmdb';
import { startDownload } from '$lib/server/torrent';
import { config } from '$lib/config';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const list = movies.list(locals.user.id);
  return json(list);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  console.log('[POST /api/movies] Adding new movie...');
  if (!locals.user) throw error(401, 'Unauthorized');

  const { magnetLink } = await request.json();

  if (!magnetLink || !magnetLink.startsWith('magnet:')) {
    throw error(400, 'Invalid magnet link');
  }

  // Parse magnet for metadata
  const { infohash, title, year } = parseMagnet(magnetLink);
  console.log(`[POST /api/movies] Parsed magnet - Title: "${title}", Year: ${year}, Infohash: ${infohash}`);

  if (!infohash) {
    throw error(400, 'Invalid magnet link - could not extract infohash');
  }

  // Check if this torrent already exists for this user
  const existing = movies.getByInfohash(infohash, locals.user.id);
  if (existing) {
    console.log(`[POST /api/movies] Movie already exists (id: ${existing.id}), returning existing`);
    // Return existing movie instead of error - allows retry of failed downloads
    if (existing.status === 'added' || existing.status === 'downloading') {
      startDownload(existing.id, magnetLink);
    }
    return json(existing, { status: 200 });
  }

  // Fetch metadata from TMDB
  let metadata: {
    title: string;
    year: number | null;
    posterUrl: string | null;
    backdropUrl: string | null;
    overview: string | null;
    tmdbId: number | null;
  } = {
    title: title || 'Unknown',
    year: year || null,
    posterUrl: null,
    backdropUrl: null,
    overview: null,
    tmdbId: null,
  };

  console.log(`[POST /api/movies] TMDB API key configured: ${!!config.tmdb.apiKey}`);
  if (title && config.tmdb.apiKey) {
    try {
      console.log(`[POST /api/movies] Searching TMDB for: "${title}" (${year || 'no year'})`);
      const results = await searchMovie(title, year);
      console.log(`[POST /api/movies] TMDB returned ${results.length} results`);
      if (results.length > 0) {
        console.log(`[POST /api/movies] Using TMDB result: "${results[0].title}" (${results[0].year}), poster: ${results[0].posterUrl}`);
        metadata = { ...metadata, ...results[0] };
      }
    } catch (e) {
      console.error('[POST /api/movies] TMDB search failed:', e);
    }
  } else {
    console.log(`[POST /api/movies] Skipping TMDB search - title: "${title}", apiKey: ${!!config.tmdb.apiKey}`);
  }

  // Create movie record
  const movie = movies.create({
    userId: locals.user.id,
    title: metadata.title,
    year: metadata.year,
    posterUrl: metadata.posterUrl,
    backdropUrl: metadata.backdropUrl,
    overview: metadata.overview,
    magnetLink,
    infohash,
    tmdbId: metadata.tmdbId,
  });

  // Start server-side download
  startDownload(movie.id, magnetLink);

  return json(movie, { status: 201 });
};
