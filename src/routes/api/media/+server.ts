import { error, json } from '@sveltejs/kit';
import { config } from '$lib/config';
import { auth } from '$lib/server/auth';
import { downloadsDb, mediaDb } from '$lib/server/db';
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

function createDefaultMetadata(title: string, year: number | undefined, tmdbId?: number): MediaMetadata {
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
		const results = mediaType === 'tv' ? await searchTVShow(title, year) : await searchMovie(title, year);

		if (results.length === 0) {
			return metadata;
		}

		const basicResult = tmdbId ? (results.find((r) => r.tmdbId === tmdbId) ?? results[0]) : results[0];

		if (basicResult.tmdbId === null) {
			return { ...metadata, ...basicResult };
		}

		const details =
			mediaType === 'tv' ? await getTVDetails(basicResult.tmdbId) : await getMovieDetails(basicResult.tmdbId);

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

export const GET: RequestHandler = async ({ locals, url, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	// Get user's organization
	const [userOrganization] = await auth.api.listOrganizations({
		// This endpoint requires session cookies.
		headers: request.headers,
	});

	if (!userOrganization) {
		throw error(400, 'No organization found');
	}

	const type = url.searchParams.get('type') as MediaType | null;
	const list = mediaDb.list(userOrganization.id, type ?? undefined);
	return json(list);
};

// Helper to determine media type from magnet details
function determineMediaType(providedType: MediaType | undefined, name: string, title: string): MediaType {
	if (providedType) {
		return providedType;
	}
	// Use raw name first as it contains more signals (e.g. S01)
	if (name && isTVShowFilename(name)) {
		return 'tv';
	}
	// Fallback to parsed title
	if (title && isTVShowFilename(title)) {
		return 'tv';
	}
	return 'movie';
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json();
	const { magnetLink, type: providedType, tmdbId } = body;

	if (!magnetLink?.startsWith('magnet:')) {
		throw error(400, 'Invalid magnet link');
	}

	const { infohash, title, year, name } = parseMagnet(magnetLink);
	if (!infohash) {
		throw error(400, 'Invalid magnet link - could not extract infohash');
	}

	// Determine media type
	const mediaType = determineMediaType(providedType, name, title);

	// Check for existing media by infohash (exact same torrent)
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

	// Check if this infohash already exists as a download for any media
	const existingDownload = downloadsDb.infohashExistsForUser(infohash, locals.user.id);
	if (existingDownload) {
		// This exact torrent is already being tracked
		const { download, media } = existingDownload;
		if (download.status === 'added' || download.status === 'downloading') {
			startDownload(media.id, magnetLink).catch((e) => {
				console.error(`Failed to resume download for ${media.id}:`, e);
				downloadsDb.updateProgress(download.id, 0, 'error');
			});
		}
		return json(media, { status: 200 });
	}

	// Fetch TMDB metadata
	const metadata = await fetchTmdbMetadata(title, year, mediaType, tmdbId);

	// For TV shows, check if we already have this show (by TMDB ID) and should merge seasons
	if (mediaType === 'tv' && metadata.tmdbId) {
		const existingShow = mediaDb.getByTmdbId(metadata.tmdbId, locals.user.id, 'tv');
		if (existingShow) {
			// console.log(
			// 	`[POST /api/media] Found existing TV show "${existingShow.title}" (${existingShow.id}), adding new season download`
			// );

			// Create a download record for this new torrent
			const download = downloadsDb.create({
				mediaId: existingShow.id,
				magnetLink,
				infohash,
				status: 'added',
				progress: 0,
			});

			// Start download - episodes will be added to the existing show
			startDownload(existingShow.id, magnetLink).catch((e) => {
				console.error(`Failed to start download for ${existingShow.id}:`, e);
				downloadsDb.updateProgress(download.id, 0, 'error');
			});

			// Return with seasonAdded flag so frontend knows this was a season addition, not a new show
			return json({ ...existingShow, _seasonAdded: true }, { status: 200 });
		}
	}

	// Get user's organization
	const [userOrganization] = await auth.api.listOrganizations({
		// This endpoint requires session cookies.
		headers: request.headers,
	});

	if (!userOrganization) {
		throw error(400, 'No organization found');
	}

	// Create new media record
	const mediaItem = mediaDb.create({
		userId: locals.user.id,
		organizationId: userOrganization.id,
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

	// Create initial download record for the new media
	downloadsDb.create({
		mediaId: mediaItem.id,
		magnetLink,
		infohash,
		status: 'added',
		progress: 0,
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
