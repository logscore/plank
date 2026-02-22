import { error, json } from '@sveltejs/kit';
import { mediaDb } from '$lib/server/db';
import { cancelDownload, deleteMediaFiles } from '$lib/server/torrent';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
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

	mediaDb.updateLastPlayed(params.id);

	return json(mediaItem);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		throw error(400, 'No active profile selected');
	}

	const mediaId = params.id;

	// Cancel any active download for this media
	await cancelDownload(mediaId);

	// Delete all files associated with this media from the file system
	await deleteMediaFiles(mediaId);

	// Delete from database
	mediaDb.delete(mediaId, organizationId);

	return new Response(null, { status: 204 });
};
