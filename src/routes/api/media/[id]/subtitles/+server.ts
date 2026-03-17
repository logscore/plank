import path from 'node:path';
import { json } from '@sveltejs/kit';
import { requireMediaAccess } from '$lib/server/api-guard';
import { episodesDb } from '$lib/server/db';
import { discoverSubtitles, getSubtitleTracks } from '$lib/server/subtitles';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);

	const episodeId = url.searchParams.get('episodeId') ?? undefined;
	const rawPath = episodeId ? (episodesDb.getById(episodeId)?.filePath ?? null) : mediaItem.filePath;
	const libraryDir = rawPath ? path.dirname(rawPath) : null;

	if (rawPath && libraryDir) {
		discoverSubtitles(params.id, rawPath, libraryDir, episodeId).catch((err) =>
			console.error('[Subtitles] Discovery error:', err)
		);
	}

	return json(getSubtitleTracks(params.id, episodeId));
};
