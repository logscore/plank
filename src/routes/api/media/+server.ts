import { error, json } from '@sveltejs/kit';
import { config } from '$lib/config';
import { mediaDb } from '$lib/server/db';
import { parseMagnet } from '$lib/server/magnet';
import {
	getMovieDetails,
	getTVDetails,
	isTVShowFilename,
	saveTmdbImages,
	searchMovie,
	searchTVShow,
} from '$lib/server/tmdb';
import { startDownload } from '$lib/server/torrent';
import type { MediaType } from '$lib/types';
import type { RequestHandler } from './$types';

interface MediaMetadata {
	title: string;
	year: number | null;
	posterUrl: string | null;
	backdropUrl: string | null;
	overview: string | null;
	tmdbId: number | null;
	runtime: number | null;
	genres: string | null;
	originalLanguage: string | null;
	certification: string | null;
	totalSeasons: number | null;
}

function createDefaultMetadata(
	title: string,
	year: number | undefined,
	tmdbId?: number
): MediaMetadata {
	return {
		title: title || 'Unknown',
		year: year || null,
		posterUrl: null,
		backdropUrl: null,
		overview: null,
		tmdbId: tmdbId || null,
		runtime: null,
		genres: null,
		originalLanguage: null,
		certification: null,
		totalSeasons: null,
	};
}

async function fetchTmdbMetadata(
	title: string,
	year: number | undefined,
	mediaType: MediaType,
	tmdbId?: number
): Promise<MediaMetadata> {
	const metadata = createDefaultMetadata(title, year, tmdbId);

	if (!config.tmdb.apiKey) {
		return metadata;
	}

	try {
		const results =
			mediaType === 'tv' ? await searchTVShow(title, year) : await searchMovie(title, year);

		if (results.length === 0) {
			return metadata;
		}

		const basicResult = tmdbId
			? (results.find((r) => r.tmdbId === tmdbId) ?? results[0])
			: results[0];

		if (basicResult.tmdbId === null) {
			return { ...metadata, ...basicResult };
		}

		const details =
			mediaType === 'tv'
				? await getTVDetails(basicResult.tmdbId)
				: await getMovieDetails(basicResult.tmdbId);

		return { ...metadata, ...details };
	} catch (e) {
		console.error('[TMDB] Search failed:', e);
		return metadata;
	}
}

function saveImagesAsync(metadata: MediaMetadata, mediaId: string): void {
	if (!(metadata.posterUrl || metadata.backdropUrl)) {
		return;
	}

	(async () => {
		try {
			const updatedImages = await saveTmdbImages(metadata, 'library', mediaId);
			mediaDb.updateMetadata(mediaId, {
				posterUrl: updatedImages.posterUrl,
				backdropUrl: updatedImages.backdropUrl,
			});
		} catch (e) {
			console.error(`[POST /api/media] Failed to save images for ${mediaId}:`, e);
		}
	})();
}

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const type = url.searchParams.get('type') as MediaType | null;
	const list = mediaDb.list(locals.user.id, type ?? undefined);
	return json(list);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json();
	const { magnetLink, type: providedType, tmdbId } = body;

	if (!magnetLink?.startsWith('magnet:')) {
		throw error(400, 'Invalid magnet link');
	}

	const { infohash, title, year } = parseMagnet(magnetLink);
	if (!infohash) {
		throw error(400, 'Invalid magnet link - could not extract infohash');
	}

	// Determine media type (auto-detect or use provided)
	let mediaType: MediaType = providedType || 'movie';
	if (!providedType && title) {
		mediaType = isTVShowFilename(title) ? 'tv' : 'movie';
	}

	// Check for existing
	const existing = mediaDb.getByInfohash(infohash, locals.user.id);
	if (existing) {
		if (existing.status === 'added' || existing.status === 'downloading') {
			startDownload(existing.id, magnetLink).catch((e) => {
				console.error(`Failed to resume download for ${existing.id}:`, e);
				mediaDb.updateProgress(existing.id, 0, 'error');
			});
		}
		return json(existing, { status: 200 });
	}

	// Fetch TMDB metadata
	const metadata = await fetchTmdbMetadata(title, year, mediaType, tmdbId);

	// Create media record
	const mediaItem = mediaDb.create({
		userId: locals.user.id,
		type: mediaType,
		title: metadata.title,
		year: metadata.year,
		posterUrl: metadata.posterUrl,
		backdropUrl: metadata.backdropUrl,
		overview: metadata.overview,
		magnetLink,
		infohash,
		tmdbId: metadata.tmdbId,
		runtime: metadata.runtime,
		genres: metadata.genres,
		originalLanguage: metadata.originalLanguage,
		certification: metadata.certification,
		totalSeasons: metadata.totalSeasons,
	});

	// Save images in background
	saveImagesAsync(metadata, mediaItem.id);

	// Start download
	startDownload(mediaItem.id, magnetLink).catch((e) => {
		console.error(`Failed to start download for ${mediaItem.id}:`, e);
		mediaDb.updateProgress(mediaItem.id, 0, 'error');
	});

	return json(mediaItem, { status: 201 });
};
