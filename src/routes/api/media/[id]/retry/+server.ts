import { error, json } from '@sveltejs/kit';
import { mediaDb } from '$lib/server/db';
import { startDownload } from '$lib/server/torrent';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const mediaItem = mediaDb.get(params.id, locals.user.id);
	if (!mediaItem) {
		throw error(404, 'Media not found');
	}

	// Reset status and start fresh download
	mediaDb.updateProgress(mediaItem.id, 0, 'added');

	try {
		await startDownload(mediaItem.id, mediaItem.magnetLink);
	} catch (e) {
		console.error(`Failed to restart download for ${mediaItem.id}:`, e);
		// Revert status to error
		mediaDb.updateProgress(mediaItem.id, 0, 'error');
		// If it's a magnet link error, we could return 400
		return json(
			{ success: false, message: `Failed to restart download: ${(e as Error).message}` },
			{ status: 400 }
		);
	}

	return json({ success: true, message: 'Download restarted' });
};
