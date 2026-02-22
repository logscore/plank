import { error, json } from '@sveltejs/kit';
import { config } from '$lib/config';
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

/**
 * Build metadata from browse view data, enriching with TMDB details
 * for fields the browse view doesn't carry (runtime, totalSeasons).
 */
async function enrichBrowseMetadata(
	tmdbId: number,
	mediaType: MediaType,
	title: string,
	year: number | null,
	posterUrl: string | null,
	backdropUrl: string | null,
	overview: string | null,
	genres: string[] | null,
	certification: string | null
): Promise<MediaMetadata> {
	const metadata: MediaMetadata = {
		title,
		year,
		posterUrl,
		backdropUrl,
		overview,
		tmdbId,
		runtime: null,
		genres: genres ? JSON.stringify(genres) : null,
		originalLanguage: null,
		certification,
		totalSeasons: null,
	};

	// Fetch full details for fields the browse view doesn't provide
	if (config.tmdb.apiKey) {
		try {
			const details = mediaType === 'tv' ? await getTVDetails(tmdbId) : await getMovieDetails(tmdbId);
			metadata.runtime = details.runtime ?? null;
			metadata.originalLanguage = details.originalLanguage ?? null;
			metadata.totalSeasons = details.totalSeasons ?? null;
			// Use browse genres/certification if provided, otherwise use details
			if (!metadata.genres) {
				metadata.genres = details.genres ?? null;
			}
			if (!metadata.certification) {
				metadata.certification = details.certification ?? null;
			}
		} catch (e) {
			console.error(`[TMDB] Failed to enrich browse metadata for ${tmdbId}:`, e);
		}
	}

	return metadata;
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

	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		throw error(400, 'No active profile selected');
	}

	const type = url.searchParams.get('type') as MediaType | null;
	const list = mediaDb.list(organizationId, type ?? undefined);
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

/** Resume an existing download if it's in a resumable state */
function resumeIfNeeded(mediaId: string, magnetLink: string): void {
	startDownload(mediaId, magnetLink).catch((e) => {
		console.error(`Failed to resume download for ${mediaId}:`, e);
		mediaDb.updateProgress(mediaId, 0, 'error');
	});
}

/** Check for duplicate media/downloads and return existing record if found */
function findExistingMedia(infohash: string, organizationId: string, magnetLink: string): Response | null {
	// Check by infohash on media table
	const existing = mediaDb.getByInfohash(infohash, organizationId);
	if (existing) {
		if (existing.status === 'added' || existing.status === 'downloading') {
			resumeIfNeeded(existing.id, magnetLink);
		}
		return json(existing, { status: 200 }) as unknown as Response;
	}

	// Check by infohash on downloads table
	const existingDownload = downloadsDb.infohashExistsForOrg(infohash, organizationId);
	if (existingDownload) {
		const { download, media } = existingDownload;
		if (download.status === 'added' || download.status === 'downloading') {
			resumeIfNeeded(media.id, magnetLink);
		}
		return json(media, { status: 200 }) as unknown as Response;
	}

	return null;
}

/** Resolve metadata from browse data or TMDB search */
async function resolveMetadata(
	body: Record<string, unknown>,
	magnetTitle: string,
	magnetYear: number | undefined,
	mediaType: MediaType
): Promise<MediaMetadata> {
	const { tmdbId, title: browseTitle, posterUrl, backdropUrl, overview, genres, certification } = body;
	const hasBrowseMetadata = posterUrl || backdropUrl || overview;

	if (hasBrowseMetadata && tmdbId) {
		return enrichBrowseMetadata(
			tmdbId as number,
			mediaType,
			(browseTitle as string) || magnetTitle,
			(body.year as number) ?? magnetYear ?? null,
			(posterUrl as string) ?? null,
			(backdropUrl as string) ?? null,
			(overview as string) ?? null,
			(genres as string[]) ?? null,
			(certification as string) ?? null
		);
	}

	return fetchTmdbMetadata(magnetTitle, magnetYear, mediaType, tmdbId as number | undefined);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		throw error(400, 'No active profile selected');
	}

	const body = await request.json();
	const { magnetLink, type: providedType } = body;

	if (!magnetLink?.startsWith('magnet:')) {
		throw error(400, 'Invalid magnet link');
	}

	const { infohash, title, year, name } = parseMagnet(magnetLink);
	if (!infohash) {
		throw error(400, 'Invalid magnet link - could not extract infohash');
	}

	const mediaType = determineMediaType(providedType, name, title);

	// Check for duplicates within this profile
	const existingResponse = findExistingMedia(infohash, organizationId, magnetLink);
	if (existingResponse) {
		return existingResponse;
	}

	// Resolve metadata (browse data or TMDB search)
	const metadata = await resolveMetadata(body, title, year, mediaType);

	// For TV shows, check if we should merge into an existing show within this profile
	if (mediaType === 'tv' && metadata.tmdbId) {
		const existingShow = mediaDb.getByTmdbId(metadata.tmdbId, organizationId, 'tv');
		if (existingShow) {
			const download = downloadsDb.create({
				mediaId: existingShow.id,
				magnetLink,
				infohash,
				status: 'added',
				progress: 0,
			});

			startDownload(existingShow.id, magnetLink).catch((e) => {
				console.error(`Failed to start download for ${existingShow.id}:`, e);
				downloadsDb.updateProgress(download.id, 0, 'error');
			});

			return json({ ...existingShow, _seasonAdded: true }, { status: 200 });
		}
	}

	// Create new media record
	const mediaItem = mediaDb.create({
		userId: locals.user.id,
		organizationId,
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

	// Create initial download record
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
