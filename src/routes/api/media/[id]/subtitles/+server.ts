import { error, json } from '@sveltejs/kit';
import { episodesDb, mediaDb } from '$lib/server/db';
import { discoverSubtitles, getSubtitleTracks } from '$lib/server/subtitles';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const episodeId = url.searchParams.get('episodeId') ?? undefined;
	const mediaItem = mediaDb.get(params.id, locals.user.id);
	if (!mediaItem) {
		throw error(404, 'Media not found');
	}

	// Determine file path for subtitle discovery
	let filePath: string | null = null;
	let libraryDir: string | null = null;

	if (episodeId) {
		const episode = episodesDb.getById(episodeId);
		filePath = episode?.filePath ?? null;
		if (filePath) {
			const path = await import('node:path');
			libraryDir = path.dirname(filePath);
		}
	} else {
		filePath = mediaItem.filePath;
		if (filePath) {
			const path = await import('node:path');
			libraryDir = path.dirname(filePath);
		}
	}

	// Trigger discovery in background if file exists
	if (filePath && libraryDir) {
		discoverSubtitles(params.id, filePath, libraryDir, episodeId).catch((err) =>
			console.error('[Subtitles] Discovery error:', err)
		);
	}

	const tracks = getSubtitleTracks(params.id, episodeId);
	return json(tracks);
};
