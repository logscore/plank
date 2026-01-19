import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { movies } from '$lib/server/db';
import { startDownload } from '$lib/server/torrent';

export const POST: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const movie = movies.get(params.id, locals.user.id);
  if (!movie) throw error(404, 'Movie not found');

  // Reset status and start fresh download
  movies.updateProgress(movie.id, 0, 'added');
  startDownload(movie.id, movie.magnetLink);

  return json({ success: true, message: 'Download restarted' });
};

