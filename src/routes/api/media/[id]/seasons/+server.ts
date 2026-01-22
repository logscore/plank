import { error, json } from '@sveltejs/kit';
import { episodesDb, mediaDb, seasonsDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const mediaItem = mediaDb.get(params.id, locals.user.id);
	if (!mediaItem) {
		throw error(404, 'Media not found');
	}

	if (mediaItem.type !== 'tv') {
		throw error(400, 'Not a TV show');
	}

	const seasons = seasonsDb.getByMediaId(params.id);

	// Include episodes for each season
	const seasonsWithEpisodes = seasons.map((season) => ({
		...season,
		episodes: episodesDb.getBySeasonId(season.id),
	}));

	return json(seasonsWithEpisodes);
};
