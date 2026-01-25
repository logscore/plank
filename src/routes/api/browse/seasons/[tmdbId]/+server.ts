/**
 * TV Seasons API - Fetch all seasons for a TV show
 *
 * GET /api/browse/seasons/[tmdbId]
 */

import { error, json } from '@sveltejs/kit';
import { getTVSeasons } from '$lib/server/tmdb';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	// Auth check
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const tmdbId = Number.parseInt(params.tmdbId, 10);

	if (Number.isNaN(tmdbId)) {
		throw error(400, 'Invalid TMDB ID');
	}

	try {
		const seasons = await getTVSeasons(tmdbId);
		return json({ seasons });
	} catch (e) {
		console.error(`[API] Failed to fetch seasons for TMDB ${tmdbId}:`, e);
		throw error(500, 'Failed to fetch seasons');
	}
};
