import { json } from '@sveltejs/kit';
import { requireMediaAccess } from '$lib/server/api-guard';
import { getStoragePathDirectory } from '$lib/server/storage';
import { discoverSubtitles, getSubtitleTracks } from '$lib/server/subtitles';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);
	const rawPath = mediaItem.filePath;
	const libraryDir = rawPath ? getStoragePathDirectory(rawPath) : null;
	if (rawPath && libraryDir) {
		discoverSubtitles(params.id, mediaItem.organizationId, rawPath, libraryDir).catch((errorValue) =>
			console.error('[Subtitles] Discovery error:', errorValue)
		);
	}
	return json(getSubtitleTracks(params.id));
};
