import path from 'node:path';
import { json } from '@sveltejs/kit';
import { requireMediaAccess } from '$lib/server/api-guard';
import { discoverSubtitles, getSubtitleTracks } from '$lib/server/subtitles';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);
	const rawPath = mediaItem.filePath;
	const libraryDir = rawPath ? path.dirname(rawPath) : null;
	if (rawPath && libraryDir) {
		discoverSubtitles(params.id, rawPath, libraryDir).catch((errorValue) =>
			console.error('[Subtitles] Discovery error:', errorValue)
		);
	}
	return json(getSubtitleTracks(params.id));
};
