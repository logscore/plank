import fs from 'node:fs/promises';
import { error, json } from '@sveltejs/kit';
import { mediaDb } from '$lib/server/db';
import { startDownload } from '$lib/server/torrent';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		throw error(400, 'No active profile selected');
	}

	const mediaItem = mediaDb.get(params.id, organizationId);
	if (!mediaItem) {
		throw error(404, 'Media not found');
	}

	// Delete existing file if present
	if (mediaItem.filePath) {
		try {
			await fs.unlink(mediaItem.filePath);
		} catch (e) {
			console.warn(`Failed to delete existing file for ${mediaItem.id}:`, e);
		}
	}

	// Reset status, clear file info, and start fresh download
	mediaDb.resetDownload(mediaItem.id);

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
