import fs from 'node:fs/promises';
import { json } from '@sveltejs/kit';
import { requireMediaAccess } from '$lib/server/api-guard';
import { mediaDb } from '$lib/server/db';
import { acquireMediaByImdb } from '$lib/server/media-acquisition';
import { startDownload } from '$lib/server/torrent';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);

	if (mediaItem.filePath) {
		try {
			await fs.unlink(mediaItem.filePath);
		} catch (e) {
			console.warn(`Failed to delete existing file for ${mediaItem.id}:`, e);
		}
	}

	mediaDb.resetDownload(mediaItem.id);
	if (mediaItem.type === 'show') {
		return json({ success: false, message: 'Shows are not directly retryable' }, { status: 400 });
	}
	if (!mediaItem.magnetLink) {
		if (!mediaItem.imdbId) {
			return json({ success: false, message: 'No magnet link or IMDb id available for retry' }, { status: 400 });
		}
		const acquisition = await acquireMediaByImdb(mediaItem.id, {
			mediaType: mediaItem.type === 'episode' ? 'episode' : 'movie',
			seasonNumber: mediaItem.seasonNumber,
			episodeNumber: mediaItem.episodeNumber,
		});
		if (acquisition.status === 'not_found') {
			return json({ success: false, message: 'No torrent found for retry' }, { status: 404 });
		}
		if (acquisition.status === 'error') {
			return json({ success: false, message: 'Failed to reacquire media' }, { status: 400 });
		}
		return json({ success: true, message: 'Download reacquired' });
	}

	try {
		await startDownload(mediaItem.id, mediaItem.magnetLink);
	} catch (e) {
		console.error(`Failed to restart download for ${mediaItem.id}:`, e);
		mediaDb.updateProgress(mediaItem.id, 0, 'error');
		return json(
			{ success: false, message: `Failed to restart download: ${(e as Error).message}` },
			{ status: 400 }
		);
	}

	return json({ success: true, message: 'Download restarted' });
};
