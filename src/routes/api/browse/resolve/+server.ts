/**
 * Torrent Resolution API - Phase 2: Getting the Magnet
 *
 * Resolves IMDB ID to a magnet link via Jackett.
 * Filters for high-quality releases from trusted groups (YTS, YIFY, BONE).
 */

import { error, json } from '@sveltejs/kit';
import { findBestTorrent, parseTorrentTitle } from '$lib/server/jackett';
import { getBrowseItemDetails } from '$lib/server/tmdb';
import { cacheTorrent, getCachedTorrent } from '$lib/server/torrent-cache';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	// Auth check
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json();
	const { imdbId, tmdbId, title } = body;

	if (!(imdbId || tmdbId)) {
		throw error(400, 'Either imdbId or tmdbId is required');
	}

	// Get IMDB ID if only TMDB ID provided
	let resolvedImdbId = imdbId;
	if (!resolvedImdbId && tmdbId) {
		// Assume movie type for resolve API (can be extended to support TV)
		const details = await getBrowseItemDetails(tmdbId, 'movie');
		resolvedImdbId = details.imdbId;
	}

	if (!resolvedImdbId) {
		throw error(400, 'Could not resolve IMDB ID for this movie');
	}

	// Check cache first
	const cached = await getCachedTorrent(resolvedImdbId);
	if (cached) {
		return json({
			success: true,
			cached: true,
			torrent: {
				imdbId: cached.imdbId,
				tmdbId: cached.tmdbId,
				magnetLink: cached.magnetLink,
				infohash: cached.infohash,
				title: cached.title,
				quality: cached.quality,
				releaseGroup: cached.releaseGroup,
				size: cached.size,
				seeders: cached.seeders,
			},
		});
	}

	// Search Jackett for best torrent
	const torrent = await findBestTorrent(resolvedImdbId);

	if (!torrent) {
		return json({
			success: false,
			error: 'No suitable torrent found',
			message: 'Could not find a high-quality torrent from trusted sources (YTS, YIFY, BONE)',
		});
	}

	// Parse quality and release group from title
	const { quality, releaseGroup } = parseTorrentTitle(torrent.title);

	// Cache the result
	await cacheTorrent({
		imdbId: resolvedImdbId,
		tmdbId: tmdbId || undefined,
		magnetLink: torrent.magnetUri,
		infohash: torrent.infohash,
		title: title || torrent.title,
		quality: quality ?? undefined,
		releaseGroup: releaseGroup ?? undefined,
		size: torrent.size,
		seeders: torrent.seeders,
	});

	return json({
		success: true,
		cached: false,
		torrent: {
			imdbId: resolvedImdbId,
			tmdbId,
			magnetLink: torrent.magnetUri,
			infohash: torrent.infohash,
			title: torrent.title,
			quality,
			releaseGroup,
			size: torrent.size,
			seeders: torrent.seeders,
		},
	});
};
