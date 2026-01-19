import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchMovie } from '$lib/server/tmdb';
import { config } from '$lib/config';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const query = url.searchParams.get('q');
  const year = url.searchParams.get('year');

  if (!query) {
    throw error(400, 'Query parameter required');
  }

  if (!config.tmdb.apiKey) {
    throw error(500, 'TMDB API key not configured');
  }

  const results = await searchMovie(query, year ? parseInt(year) : null);

  return json(results);
};
