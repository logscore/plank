import { error, json } from '@sveltejs/kit';
import { requireMediaAccess } from '$lib/server/api-guard';
import { episodesDb, seasonsDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);

	if (mediaItem.type !== 'tv') {
		throw error(400, 'Not a TV show');
	}

	const seasons = seasonsDb.getByMediaId(params.id);
	const seasonsWithEpisodes = seasons.map((season) => ({
		...season,
		episodes: episodesDb.getBySeasonId(season.id),
	}));

	return json(seasonsWithEpisodes);
};
