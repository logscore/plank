// Syncs TMDB season metadata and queues episode downloads for browse
// FEATURE: Metadata-first episodic torrent acquisition for queued season ingestion flows

import { mediaDb, seasonsDb } from './db';
import { getShowLibraryDirectoryId } from './library-paths';
import { acquireMediaByImdb, waitForTerminalMediaState } from './media-acquisition';
import { getSeasonDetailsWithExternalIds, getTVDetails, saveTmdbImages } from './tmdb';

const SEASON_DOWNLOAD_CONCURRENCY = 3;
const activeSeasonJobs = new Map<string, Promise<void>>();

export interface AddSeasonFromBrowseParams {
	tmdbId: number;
	seasonNumber: number;
	title: string;
	year?: number | null;
	posterUrl?: string | null;
	backdropUrl?: string | null;
	overview?: string | null;
	genres?: string[] | null;
	certification?: string | null;
}

export interface AddSeasonFromBrowseContext {
	userId: string;
	organizationId: string;
}

export interface AddSeasonFromBrowseResult {
	mode: 'browse-season';
	status: 'queued';
	showId: string;
	seasonId: string;
	seasonNumber: number;
	episodeCount: number;
}

interface ShowMetadata {
	title: string;
	year: number | null;
	posterUrl: string | null;
	backdropUrl: string | null;
	overview: string | null;
	runtime: number | null;
	genres: string | null;
	originalLanguage: string | null;
	certification: string | null;
	totalSeasons: number | null;
}

function isEpisodeAired(airDate: string | null): boolean {
	if (!airDate) {
		return false;
	}
	return new Date(airDate).getTime() <= Date.now();
}

function getSeasonJobKey(showId: string, seasonNumber: number): string {
	return `${showId}:${seasonNumber}`;
}

function shouldQueueEpisode(episode: { filePath: string | null; status: string | null }): boolean {
	if (episode.filePath || episode.status === 'complete') {
		return false;
	}
	return episode.status === 'pending' || episode.status === 'searching';
}

async function resolveShowMetadata(params: AddSeasonFromBrowseParams): Promise<ShowMetadata> {
	try {
		const details = await getTVDetails(params.tmdbId);
		return {
			title: params.title || details.title,
			year: params.year ?? details.year ?? null,
			posterUrl: params.posterUrl ?? details.posterUrl,
			backdropUrl: params.backdropUrl ?? details.backdropUrl,
			overview: params.overview ?? details.overview,
			runtime: details.runtime ?? null,
			genres: params.genres ? JSON.stringify(params.genres) : (details.genres ?? null),
			originalLanguage: details.originalLanguage ?? null,
			certification: params.certification ?? details.certification ?? null,
			totalSeasons: details.totalSeasons ?? null,
		};
	} catch (errorValue) {
		console.error(`[Season Sync] Failed to resolve TV metadata for ${params.tmdbId}:`, errorValue);
		return {
			title: params.title,
			year: params.year ?? null,
			posterUrl: params.posterUrl ?? null,
			backdropUrl: params.backdropUrl ?? null,
			overview: params.overview ?? null,
			runtime: null,
			genres: params.genres ? JSON.stringify(params.genres) : null,
			originalLanguage: null,
			certification: params.certification ?? null,
			totalSeasons: null,
		};
	}
}

async function saveShowImages(showId: string, metadata: ShowMetadata): Promise<void> {
	if (!(metadata.posterUrl || metadata.backdropUrl)) {
		return;
	}
	try {
		const existingShow = mediaDb.getById(showId);
		const showDirectoryId = getShowLibraryDirectoryId({
			id: showId,
			title: metadata.title,
			year: metadata.year,
			organizationId: existingShow?.organizationId,
		});
		const savedImages = await saveTmdbImages(
			{
				tmdbId: null,
				title: metadata.title,
				year: metadata.year,
				posterUrl: metadata.posterUrl,
				backdropUrl: metadata.backdropUrl,
				overview: metadata.overview,
				runtime: metadata.runtime,
				genres: metadata.genres,
				originalLanguage: metadata.originalLanguage,
				certification: metadata.certification,
				totalSeasons: metadata.totalSeasons,
			},
			'library',
			showDirectoryId,
			existingShow?.organizationId
		);
		mediaDb.updateMetadata(showId, {
			posterUrl: savedImages.posterUrl,
			backdropUrl: savedImages.backdropUrl,
		});
	} catch (errorValue) {
		console.error(`[Season Sync] Failed to save images for ${showId}:`, errorValue);
	}
}

async function upsertShow(
	context: AddSeasonFromBrowseContext,
	params: AddSeasonFromBrowseParams
): Promise<{ showId: string; metadata: ShowMetadata }> {
	const metadata = await resolveShowMetadata(params);
	const existingShow = mediaDb.getByTmdbId(params.tmdbId, context.organizationId, 'show');
	if (existingShow) {
		mediaDb.updateMetadata(existingShow.id, {
			title: metadata.title,
			year: metadata.year,
			posterUrl: metadata.posterUrl,
			backdropUrl: metadata.backdropUrl,
			overview: metadata.overview,
			tmdbId: params.tmdbId,
			runtime: metadata.runtime,
			genres: metadata.genres,
			originalLanguage: metadata.originalLanguage,
			certification: metadata.certification,
			totalSeasons: metadata.totalSeasons,
		});
		saveShowImages(existingShow.id, metadata).catch(() => undefined);
		return { showId: existingShow.id, metadata };
	}
	const show = mediaDb.create({
		userId: context.userId,
		organizationId: context.organizationId,
		type: 'show',
		title: metadata.title,
		year: metadata.year,
		posterUrl: metadata.posterUrl,
		backdropUrl: metadata.backdropUrl,
		overview: metadata.overview,
		tmdbId: params.tmdbId,
		runtime: metadata.runtime,
		genres: metadata.genres,
		originalLanguage: metadata.originalLanguage,
		certification: metadata.certification,
		totalSeasons: metadata.totalSeasons,
	});
	saveShowImages(show.id, metadata).catch(() => undefined);
	return { showId: show.id, metadata };
}

export async function syncSeasonMetadata(showId: string, tmdbId: number, seasonNumber: number) {
	const show = mediaDb.getById(showId);
	if (!(show && show.type === 'show')) {
		throw new Error('Show not found');
	}
	const seasonDetails = await getSeasonDetailsWithExternalIds(tmdbId, seasonNumber);
	const airedEpisodes = seasonDetails.episodes.filter((episode) => isEpisodeAired(episode.airDate));
	const existingSeason = seasonsDb.getByMediaAndNumber(showId, seasonDetails.seasonNumber);
	const season = existingSeason
		? (() => {
				seasonsDb.update(existingSeason.id, {
					name: seasonDetails.name,
					overview: seasonDetails.overview,
					posterPath: seasonDetails.posterPath,
					airDate: seasonDetails.airDate,
					episodeCount: airedEpisodes.length,
				});
				return seasonsDb.getById(existingSeason.id) ?? existingSeason;
			})()
		: seasonsDb.create({
				mediaId: showId,
				seasonNumber: seasonDetails.seasonNumber,
				name: seasonDetails.name,
				overview: seasonDetails.overview,
				posterPath: seasonDetails.posterPath,
				airDate: seasonDetails.airDate,
				episodeCount: airedEpisodes.length,
			});

	for (const [displayOrder, episode] of airedEpisodes.entries()) {
		const existingEpisode = mediaDb.getEpisodeByParentAndNumber(
			showId,
			seasonDetails.seasonNumber,
			episode.episodeNumber
		);
		const nextStatus = episode.imdbId ? 'pending' : 'not_found';
		if (existingEpisode) {
			let status = existingEpisode.status;
			if (!(episode.imdbId || existingEpisode.filePath || existingEpisode.magnetLink)) {
				status = nextStatus;
			} else if (existingEpisode.status === 'not_found' && episode.imdbId && !existingEpisode.filePath) {
				status = 'pending';
			}
			mediaDb.update(existingEpisode.id, {
				parentId: showId,
				seasonId: season.id,
				seasonNumber: seasonDetails.seasonNumber,
				episodeNumber: episode.episodeNumber,
				displayOrder,
				title: episode.title ?? `Episode ${episode.episodeNumber}`,
				overview: episode.overview,
				stillPath: episode.stillPath,
				runtime: episode.runtime,
				airDate: episode.airDate,
				tmdbId: episode.tmdbId,
				imdbId: episode.imdbId,
				status,
			});
			continue;
		}
		mediaDb.create({
			userId: show.userId,
			organizationId: show.organizationId,
			type: 'episode',
			parentId: showId,
			seasonId: season.id,
			seasonNumber: seasonDetails.seasonNumber,
			episodeNumber: episode.episodeNumber,
			displayOrder,
			title: episode.title ?? `Episode ${episode.episodeNumber}`,
			overview: episode.overview,
			stillPath: episode.stillPath,
			runtime: episode.runtime,
			airDate: episode.airDate,
			tmdbId: episode.tmdbId,
			imdbId: episode.imdbId,
			status: nextStatus,
		});
	}

	return {
		season,
		episodes: mediaDb.getEpisodesBySeasonId(season.id),
	};
}

async function processSeasonEpisode(mediaId: string): Promise<void> {
	const episode = mediaDb.getById(mediaId);
	if (!(episode && episode.type === 'episode' && shouldQueueEpisode(episode))) {
		return;
	}
	mediaDb.update(mediaId, { status: 'searching', progress: 0 });
	const result = await acquireMediaByImdb(mediaId, {
		mediaType: 'episode',
		seasonNumber: episode.seasonNumber,
		episodeNumber: episode.episodeNumber,
	});
	if (result.status === 'started' || result.status === 'active') {
		await waitForTerminalMediaState(mediaId);
	}
}

async function runSeasonQueue(seasonId: string): Promise<void> {
	const episodeIds = mediaDb
		.getEpisodesBySeasonId(seasonId)
		.filter((episode) => shouldQueueEpisode(episode))
		.map((episode) => episode.id);
	let nextIndex = 0;
	const workerCount = Math.min(SEASON_DOWNLOAD_CONCURRENCY, episodeIds.length);
	const workers = Array.from({ length: workerCount }, async () => {
		while (nextIndex < episodeIds.length) {
			const episodeId = episodeIds[nextIndex];
			nextIndex += 1;
			await processSeasonEpisode(episodeId);
		}
	});
	await Promise.all(workers);
}

function queueSeasonDownloads(showId: string, seasonId: string, seasonNumber: number): void {
	const jobKey = getSeasonJobKey(showId, seasonNumber);
	if (activeSeasonJobs.has(jobKey)) {
		return;
	}
	const job = runSeasonQueue(seasonId).finally(() => {
		activeSeasonJobs.delete(jobKey);
	});
	activeSeasonJobs.set(jobKey, job);
	job.catch((errorValue) => {
		console.error(`[Season Sync] Season queue failed for ${jobKey}:`, errorValue);
	});
}

export async function addSeasonFromBrowse(
	context: AddSeasonFromBrowseContext,
	params: AddSeasonFromBrowseParams
): Promise<AddSeasonFromBrowseResult> {
	const { showId } = await upsertShow(context, params);
	const { season, episodes } = await syncSeasonMetadata(showId, params.tmdbId, params.seasonNumber);
	queueSeasonDownloads(showId, season.id, season.seasonNumber);
	return {
		mode: 'browse-season',
		status: 'queued',
		showId,
		seasonId: season.id,
		seasonNumber: season.seasonNumber,
		episodeCount: episodes.length,
	};
}
