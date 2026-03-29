/**
 * Browse Details API - Lazy Enrichment
 *
 * Accepts a batch of TMDB IDs and returns IMDB IDs, certifications,
 * and cached magnet links. Called lazily after browse items render.
 */

import { error, json } from '@sveltejs/kit';
import { getBrowseItemDetails } from '$lib/server/tmdb';
import { getCachedTorrents } from '$lib/server/torrent-cache';
import type { RequestHandler } from './$types';

interface DetailRequest {
	tmdbId: number;
	mediaType: 'movie' | 'show';
}

interface DetailResult {
	tmdbId: number;
	imdbId: string | null;
	certification: string | null;
	magnetLink?: string;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const body: { items: DetailRequest[] } = await request.json();

	if (!Array.isArray(body.items) || body.items.length === 0) {
		return json({ details: [] });
	}

	// Cap batch size to prevent abuse
	const items = body.items.slice(0, 40);

	// Fetch IMDB IDs and certifications in parallel (server-side cache handles dedup)
	const details = await Promise.all(
		items.map(async ({ tmdbId, mediaType }): Promise<DetailResult> => {
			const result = await getBrowseItemDetails(tmdbId, mediaType);
			return { tmdbId, imdbId: result.imdbId, certification: result.certification };
		})
	);

	// Batch lookup cached magnet links for all resolved IMDB IDs
	const imdbIds = details.filter((d) => d.imdbId).map((d) => d.imdbId as string);
	const cachedTorrents = await getCachedTorrents(imdbIds);

	// Attach cached magnet links
	const enrichedDetails = details.map((detail) => {
		if (detail.imdbId && cachedTorrents.has(detail.imdbId)) {
			const cached = cachedTorrents.get(detail.imdbId);
			return { ...detail, magnetLink: cached?.magnetLink };
		}
		return detail;
	});

	return json({ details: enrichedDetails });
};
