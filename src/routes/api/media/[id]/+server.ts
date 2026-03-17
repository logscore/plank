import { json } from '@sveltejs/kit';
import { requireMediaAccess } from '$lib/server/api-guard';
import { mediaDb } from '$lib/server/db';
import { cancelDownload, deleteMediaFiles } from '$lib/server/torrent';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);
	mediaDb.updateLastPlayed(params.id);
	return json(mediaItem);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const { organizationId } = requireMediaAccess(locals, params.id);
	const mediaId = params.id;

	await cancelDownload(mediaId);
	await deleteMediaFiles(mediaId);
	mediaDb.delete(mediaId, organizationId);

	return new Response(null, { status: 204 });
};
