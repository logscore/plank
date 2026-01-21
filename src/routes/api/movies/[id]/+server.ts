import { error, json } from '@sveltejs/kit';
import { movies } from '$lib/server/db';
import { cancelDownload, deleteMovieFiles } from '$lib/server/torrent';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const movie = movies.get(params.id, locals.user.id);
	if (!movie) {
		throw error(404, 'Movie not found');
	}

	movies.updateLastPlayed(params.id);

	return json(movie);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const movieId = params.id;

	// Cancel any active download for this movie
	await cancelDownload(movieId);

	// Delete all files associated with this movie from the file system
	await deleteMovieFiles(movieId);

	// Delete from database
	movies.delete(movieId, locals.user.id);

	return new Response(null, { status: 204 });
};
