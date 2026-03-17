import { json } from '@sveltejs/kit';
import { requireMediaAccess } from '$lib/server/api-guard';
import { getDownloadStatus, isDownloadActive } from '$lib/server/torrent';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);
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
