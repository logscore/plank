import { error } from "@sveltejs/kit";
import type { Media } from "$lib/server/db/schema";
import type { MediaType } from "$lib/types";
import { downloadsDb, mediaDb } from "./db";
import { savePosterBackdropImages } from "./images";
import { getMovieLibraryDirectoryId, getShowLibraryDirectoryId } from "./paths";
import { getSettings } from "./settings";
import { AdultContentError, getMovieDetails, getTVDetails, isTVShowFilename, searchMovie, searchTVShow } from "./tmdb";
import { startDownload } from "./torrent/download";
import { parseMagnet } from "./torrent/files";

interface MediaMetadata {
	backdropUrl: string | null;
	certification: string | null;
	genres: string | null;
	originalLanguage: string | null;
	overview: string | null;
	posterUrl: string | null;
	runtime: number | null;
	title: string;
	tmdbId: number | null;
	totalSeasons: number | null;
	voteAverage: number | null;
	year: number | null;
}

interface BrowseSeasonRequest {
	backdropUrl?: string | null;
	certification?: string | null;
	genres?: string[] | null;
	mode: "browse-season";
	overview?: string | null;
	posterUrl?: string | null;
	seasonNumber: number;
	title: string;
	tmdbId: number;
	year?: number | null;
}

export interface AddMediaFromMagnetParams {
	backdropUrl?: string | null;
	certification?: string | null;
	genres?: string[] | null;
	magnetLink: string;
	overview?: string | null;
	posterUrl?: string | null;
	title?: string;
	tmdbId?: number;
	type?: MediaType;
	year?: number | null;
}

interface ExistingMediaResult {
	body: Media;
	status: 200;
}

export function isBrowseSeasonRequest(body: unknown): body is BrowseSeasonRequest {
	if (!(body && typeof body === "object" && "mode" in body && body.mode === "browse-season")) {
		return false;
	}
	const request = body as Record<string, unknown>;
	if (!(request.tmdbId && request.seasonNumber !== undefined && request.title)) {
		throw error(400, "tmdbId, seasonNumber, and title are required");
	}
	return true;
}

function createDefaultMetadata(title: string, year: number | null | undefined, tmdbId?: number): MediaMetadata {
	return {
		backdropUrl: null,
		certification: null,
		genres: null,
		originalLanguage: null,
		overview: null,
		posterUrl: null,
		runtime: null,
		title: title || "Unknown",
		tmdbId: tmdbId || null,
		totalSeasons: null,
		voteAverage: null,
		year: year || null,
	};
}

function rethrowAdultContent(cause: unknown): void {
	if (cause instanceof AdultContentError) {
		error(400, cause.message);
	}
}

async function fetchTmdbMetadata(
	title: string,
	year: number | undefined,
	mediaType: MediaType,
	tmdbId?: number
): Promise<MediaMetadata> {
	const metadata = createDefaultMetadata(title, year, tmdbId);
	const settings = await getSettings();

	if (!settings.tmdb.apiKey) {
		return metadata;
	}

	try {
		if (tmdbId) {
			const details = mediaType === "show" ? await getTVDetails(tmdbId) : await getMovieDetails(tmdbId);
			return { ...metadata, ...details };
		}

		const results = mediaType === "show" ? await searchTVShow(title, year) : await searchMovie(title, year);
		const [basicResult] = results;
		if (!basicResult) {
			return metadata;
		}
		if (basicResult.tmdbId === null) {
			return { ...metadata, ...basicResult };
		}

		const details =
			mediaType === "show" ? await getTVDetails(basicResult.tmdbId) : await getMovieDetails(basicResult.tmdbId);
		return { ...metadata, ...details };
	} catch (cause) {
		rethrowAdultContent(cause);
		console.error("[TMDB] Search failed:", cause);
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
		backdropUrl,
		certification,
		genres: genres ? JSON.stringify(genres) : null,
		originalLanguage: null,
		overview,
		posterUrl,
		runtime: null,
		title,
		tmdbId,
		totalSeasons: null,
		voteAverage: null,
		year,
	};

	// Fetch full details for fields the browse view doesn't provide
	const settings = await getSettings();
	if (settings.tmdb.apiKey) {
		try {
			const details = mediaType === "show" ? await getTVDetails(tmdbId) : await getMovieDetails(tmdbId);
			metadata.voteAverage = details.voteAverage ?? null;
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
		} catch (cause) {
			rethrowAdultContent(cause);
			console.error(`[TMDB] Failed to enrich browse metadata for ${tmdbId}:`, cause);
		}
	}

	return metadata;
}

// Helper to determine media type from magnet details
function determineMediaType(providedType: MediaType | undefined, name: string, title: string): MediaType {
	if (providedType) {
		return providedType;
	}
	// Use raw name first as it contains more signals (e.g. S01)
	if (name && isTVShowFilename(name)) {
		return "show";
	}
	// Fallback to parsed title
	if (title && isTVShowFilename(title)) {
		return "show";
	}
	return "movie";
}

/** Resume an existing download if it's in a resumable state */
function resumeIfNeeded(mediaId: string, magnetLink: string): void {
	startDownload(mediaId, magnetLink).catch((e: Error) => {
		console.error(`Failed to resume download for ${mediaId}:`, e.message);
		mediaDb.updateProgress(mediaId, 0, "error");
	});
}

/** Check for duplicate media/downloads and return existing record if found */
function findExistingMedia(infohash: string, organizationId: string, magnetLink: string): ExistingMediaResult | null {
	// Check by infohash on media table
	const existing = mediaDb.getByInfohash(infohash, organizationId);
	if (existing) {
		if (existing.status === "pending" || existing.status === "searching" || existing.status === "downloading") {
			resumeIfNeeded(existing.id, magnetLink);
		}
		return { body: existing, status: 200 };
	}

	// Check by infohash on downloads table
	const existingDownload = downloadsDb.infohashExistsForOrg(infohash, organizationId);
	if (existingDownload) {
		const { download, media } = existingDownload;
		if (download.status === "added" || download.status === "downloading") {
			resumeIfNeeded(media.id, magnetLink);
		}
		return { body: media, status: 200 };
	}

	return null;
}

/** Resolve metadata from browse data or TMDB search */
async function resolveMetadata(
	body: AddMediaFromMagnetParams,
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
			body.year ?? magnetYear ?? null,
			posterUrl ?? null,
			backdropUrl ?? null,
			overview ?? null,
			genres ?? null,
			certification ?? null
		);
	}

	return fetchTmdbMetadata(magnetTitle, magnetYear, mediaType, tmdbId as number | undefined);
}

function saveImagesInBackground(mediaItem: Media, metadata: MediaMetadata, mediaType: MediaType): void {
	if (!(metadata.posterUrl || metadata.backdropUrl)) {
		return;
	}

	const directoryId =
		mediaType === "show"
			? getShowLibraryDirectoryId({ id: mediaItem.id, title: metadata.title, year: metadata.year })
			: getMovieLibraryDirectoryId({ id: mediaItem.id, title: metadata.title, year: metadata.year });
	savePosterBackdropImages(
		{ backdropUrl: metadata.backdropUrl, posterUrl: metadata.posterUrl },
		"library",
		directoryId
	)
		.then((updatedImages) => {
			mediaDb.updateMetadata(mediaItem.id, {
				backdropUrl: updatedImages.backdropUrl,
				posterUrl: updatedImages.posterUrl,
			});
		})
		.catch((e) => {
			console.error(`[POST /api/media] Failed to save images for ${mediaItem.id}:`, e);
		});
}

export async function addMediaFromMagnet(
	userId: string,
	organizationId: string,
	params: AddMediaFromMagnetParams
): Promise<{
	body: Media;
	status: 200 | 201;
}> {
	const magnetLink = typeof params.magnetLink === "string" ? params.magnetLink : null;
	const providedType = params.type;

	if (!magnetLink?.startsWith("magnet:")) {
		throw error(400, "Invalid magnet link");
	}

	const { infohash, title, year, name } = parseMagnet(magnetLink);
	if (!infohash) {
		throw error(400, "Invalid magnet link - could not extract infohash");
	}

	const mediaType = determineMediaType(providedType, name, title);
	const existingMedia = findExistingMedia(infohash, organizationId, magnetLink);
	if (existingMedia) {
		return existingMedia;
	}

	const metadata = await resolveMetadata(params, title, year, mediaType);

	if (mediaType === "show" && metadata.tmdbId) {
		const existingShow = mediaDb.getByTmdbId(metadata.tmdbId, organizationId, "show");
		if (existingShow) {
			const download = downloadsDb.create({
				infohash,
				magnetLink,
				mediaId: existingShow.id,
				progress: 0,
				status: "added",
			});

			startDownload(existingShow.id, magnetLink).catch((e: Error) => {
				console.error(`Failed to start download for ${existingShow.id}:`, e.message);
				downloadsDb.updateProgress(download.id, 0, "error");
			});

			return { body: existingShow, status: 200 };
		}
	}

	const mediaItem = mediaDb.create({
		backdropUrl: metadata.backdropUrl,
		certification: metadata.certification,
		genres: metadata.genres,
		infohash,
		magnetLink,
		organizationId,
		originalLanguage: metadata.originalLanguage,
		overview: metadata.overview,
		posterUrl: metadata.posterUrl,
		runtime: metadata.runtime,
		title: metadata.title,
		tmdbId: metadata.tmdbId,
		totalSeasons: metadata.totalSeasons,
		type: mediaType,
		userId,
		voteAverage: metadata.voteAverage,
		year: metadata.year,
	});

	downloadsDb.create({
		infohash,
		magnetLink,
		mediaId: mediaItem.id,
		progress: 0,
		status: "added",
	});

	saveImagesInBackground(mediaItem, metadata, mediaType);

	startDownload(mediaItem.id, magnetLink).catch((e: Error) => {
		console.error(`Failed to start download for ${mediaItem.id}:`, e.message);
		mediaDb.updateProgress(mediaItem.id, 0, "error");
	});

	return { body: mediaItem, status: 201 };
}
