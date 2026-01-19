import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { movies } from '$lib/server/db';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const movie = movies.get(params.id, locals.user.id);
  if (!movie) throw error(404, 'Movie not found');

  movies.updateLastPlayed(params.id);

  return json(movie);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  movies.delete(params.id, locals.user.id);

  return new Response(null, { status: 204 });
};
