import fs from 'node:fs/promises';
import { json } from '@sveltejs/kit';
import { requireMediaAccess } from '$lib/server/api-guard';
import { mediaDb } from '$lib/server/db';
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
