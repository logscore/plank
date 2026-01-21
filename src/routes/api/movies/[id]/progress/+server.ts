import { error, json } from '@sveltejs/kit';
import { movies } from '$lib/server/db';
import { getDownloadStatus, isDownloadActive } from '$lib/server/torrent';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const movie = movies.get(params.id, locals.user.id);
	if (!movie) {
		throw error(404, 'Movie not found');
	}

	// Get live torrent progress if available
	const downloadStatus = getDownloadStatus(params.id);

	return json({
		status: downloadStatus?.status ?? movie.status,
		progress: downloadStatus?.progress ?? movie.progress,
		downloadSpeed: downloadStatus?.downloadSpeed ?? 0,
		uploadSpeed: downloadStatus?.uploadSpeed ?? 0,
		peers: downloadStatus?.peers ?? 0,
		isActive: isDownloadActive(params.id),
		filePath: movie.filePath,
		error: downloadStatus?.error,
	});
};
