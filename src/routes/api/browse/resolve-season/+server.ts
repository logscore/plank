/**
 * Season Torrent Resolution API
 *
 * Resolves a TV show season to a magnet link via Jackett.
 * Searches for season packs and filters out individual episodes.
 */

import { error, json } from '@sveltejs/kit';
import { findBestSeasonTorrent, parseTorrentTitle } from '$lib/server/jackett';
import { getBrowseItemDetails } from '$lib/server/tmdb';
import type { RequestHandler } from './$types';

export interface ResolveSeasonRequest {
	tmdbId: number;
	seasonNumber: number;
	showTitle: string;
	imdbId?: string;
}

export interface ResolveSeasonResponse {
	success: boolean;
	error?: string;
	message?: string;
	torrent?: {
		magnetLink: string;
		infohash: string;
		title: string;
		quality?: string;
		releaseGroup?: string;
		size?: number;
		seeders?: number;
	};
}

export const POST: RequestHandler = async ({ request, locals }) => {
	// Auth check
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const body: ResolveSeasonRequest = await request.json();
	const { tmdbId, seasonNumber, showTitle, imdbId } = body;

	if (!tmdbId || seasonNumber === undefined || !showTitle) {
		throw error(400, 'tmdbId, seasonNumber, and showTitle are required');
	}

	// Get IMDB ID if not provided
	let resolvedImdbId = imdbId;
	if (!resolvedImdbId) {
		try {
			const details = await getBrowseItemDetails(tmdbId, 'tv');
			resolvedImdbId = details.imdbId ?? undefined;
		} catch (e) {
			console.error(`[API] Failed to get IMDB ID for TMDB ${tmdbId}:`, e);
		}
	}

	// Search Jackett for best season pack
	const torrent = await findBestSeasonTorrent(showTitle, seasonNumber, resolvedImdbId);

	if (!torrent) {
		return json({
			success: false,
			error: 'No suitable torrent found',
			message: `Could not find a season pack for ${showTitle} Season ${seasonNumber}`,
		});
	}

	// Parse quality and release group from title
	const { quality, releaseGroup } = parseTorrentTitle(torrent.title);

	return json({
		success: true,
		torrent: {
			magnetLink: torrent.magnetUri,
			infohash: torrent.infohash,
			title: torrent.title,
			quality: quality ?? undefined,
			releaseGroup: releaseGroup ?? undefined,
			size: torrent.size,
			seeders: torrent.seeders,
		},
	});
};
