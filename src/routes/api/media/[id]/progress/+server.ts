import { error, json } from '@sveltejs/kit';
import { mediaDb } from '$lib/server/db';
import { getDownloadStatus, isDownloadActive } from '$lib/server/torrent';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const mediaItem = mediaDb.get(params.id, locals.user.id);
	if (!mediaItem) {
		throw error(404, 'Media not found');
	}

	// Get live torrent progress if available
	const downloadStatus = getDownloadStatus(params.id);

	return json({
		status: downloadStatus?.status ?? mediaItem.status,
		progress: downloadStatus?.progress ?? mediaItem.progress,
		downloadSpeed: downloadStatus?.downloadSpeed ?? 0,
		uploadSpeed: downloadStatus?.uploadSpeed ?? 0,
		peers: downloadStatus?.peers ?? 0,
		isActive: isDownloadActive(params.id),
		filePath: mediaItem.filePath,
		error: downloadStatus?.error,
	});
};
