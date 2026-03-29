import { error, json } from '@sveltejs/kit';
import { mediaDb, seasonsDb } from '$lib/server/db';
import { syncSeasonMetadata } from '$lib/server/season-sync';
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
	if (mediaItem.type !== 'show') {
		throw error(400, 'Not a show');
	}
	const seasonNumber = Number.parseInt(params.num, 10);
	if (Number.isNaN(seasonNumber)) {
		throw error(400, 'Invalid season number');
	}
	let season = seasonsDb.getByMediaAndNumber(params.id, seasonNumber);
	if (!season && mediaItem.tmdbId) {
		try {
			const synced = await syncSeasonMetadata(params.id, mediaItem.tmdbId, seasonNumber);
			season = synced.season;
		} catch (errorValue) {
			console.error(`Failed to fetch season ${seasonNumber} from TMDB:`, errorValue);
			throw error(404, 'Season not found');
		}
	}
	if (!season) {
		throw error(404, 'Season not found');
	}
	return json({
		...season,
		episodes: mediaDb.getEpisodesBySeasonId(season.id),
	});
};
