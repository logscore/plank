import { error, json } from '@sveltejs/kit';
import { mediaDb } from '$lib/server/db';
import { searchSubtitles } from '$lib/server/opensubtitles';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, url }) => {
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
