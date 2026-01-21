import { error, json } from '@sveltejs/kit';
import { movies } from '$lib/server/db';
import { startDownload } from '$lib/server/torrent';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const movie = movies.get(params.id, locals.user.id);
	if (!movie) throw error(404, 'Movie not found');

	// Reset status and start fresh download
	movies.updateProgress(movie.id, 0, 'added');

	try {
		await startDownload(movie.id, movie.magnetLink);
	} catch (e) {
		console.error(`Failed to restart download for ${movie.id}:`, e);
		// Revert status to error
		movies.updateProgress(movie.id, 0, 'error');
		// If it's a magnet link error, we could return 400
		return json(
			{ success: false, message: 'Failed to restart download: ' + (e as Error).message },
			{ status: 400 }
		);
	}

	return json({ success: true, message: 'Download restarted' });
};
