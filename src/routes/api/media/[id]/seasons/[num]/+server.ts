import { error, json } from '@sveltejs/kit';
import { episodesDb, mediaDb, seasonsDb } from '$lib/server/db';
import { getSeasonDetails } from '$lib/server/tmdb';
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

	if (mediaItem.type !== 'tv') {
		throw error(400, 'Not a TV show');
	}

	const seasonNumber = Number.parseInt(params.num, 10);
	if (Number.isNaN(seasonNumber)) {
		throw error(400, 'Invalid season number');
	}

	let season = seasonsDb.getByMediaAndNumber(params.id, seasonNumber);

	// If season doesn't exist, try to fetch from TMDB
	if (!season && mediaItem.tmdbId) {
		try {
			const seasonDetails = await getSeasonDetails(mediaItem.tmdbId, seasonNumber);

			season = seasonsDb.create({
				mediaId: params.id,
				seasonNumber: seasonDetails.seasonNumber,
				name: seasonDetails.name,
				overview: seasonDetails.overview,
				posterPath: seasonDetails.posterPath,
				airDate: seasonDetails.airDate,
				episodeCount: seasonDetails.episodeCount,
			});

			// Create episodes
			for (const [index, ep] of seasonDetails.episodes.entries()) {
				episodesDb.create({
					seasonId: season.id,
					episodeNumber: ep.episodeNumber,
					title: ep.title,
					overview: ep.overview,
					stillPath: ep.stillPath,
					runtime: ep.runtime,
					airDate: ep.airDate,
					displayOrder: index,
					status: 'pending',
				});
			}
		} catch (e) {
			console.error(`Failed to fetch season ${seasonNumber} from TMDB:`, e);
			throw error(404, 'Season not found');
		}
	}

	if (!season) {
		throw error(404, 'Season not found');
	}

	const episodes = episodesDb.getBySeasonId(season.id);

	return json({
		...season,
		episodes,
	});
};
