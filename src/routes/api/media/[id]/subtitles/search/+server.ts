import { error, json } from '@sveltejs/kit';
import { requireMediaAccess } from '$lib/server/api-guard';
import { searchSubtitles } from '$lib/server/opensubtitles';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);

	const languages = url.searchParams.get('languages') ?? undefined;
	const seasonNumber = url.searchParams.get('seasonNumber');
	const episodeNumber = url.searchParams.get('episodeNumber');

	try {
		const results = await searchSubtitles({
			tmdbId: mediaItem.tmdbId ?? undefined,
			query: mediaItem.title,
			year: mediaItem.year ?? undefined,
			languages,
			seasonNumber: seasonNumber ? Number(seasonNumber) : undefined,
			episodeNumber: episodeNumber ? Number(episodeNumber) : undefined,
		});
		return json(results);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Search failed';
		throw error(500, message);
	}
};
