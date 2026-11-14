// Syncs TMDB season metadata and queues episode downloads for browse
// FEATURE: Metadata-first episodic torrent acquisition for queued season ingestion flows

import { error } from "@sveltejs/kit";
import { mediaDb, seasonsDb } from "./db";
import { savePosterBackdropImages } from "./images";
import { acquireMediaByImdb, waitForTerminalMediaState } from "./media-acquisition";
import { getShowLibraryDirectoryId } from "./paths";
import { AdultContentError, getSeasonDetailsWithExternalIds, getTVDetails } from "./tmdb";

const SEASON_DOWNLOAD_CONCURRENCY = 3;
const activeSeasonJobs = new Map<string, Promise<void>>();

export interface AddSeasonFromBrowseParams {
	backdropUrl?: string | null;
	certification?: string | null;
	genres?: string[] | null;
	overview?: string | null;
	posterUrl?: string | null;
	seasonNumber: number;
	title: string;
	tmdbId: number;
	year?: number | null;
}

interface ShowMetadata {
	backdropUrl: string | null;
	certification: string | null;
	genres: string | null;
	originalLanguage: string | null;
	overview: string | null;
	posterUrl: string | null;
	runtime: number | null;
	title: string;
	totalSeasons: number | null;
	voteAverage: number | null;
	year: number | null;
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
	if (episode.filePath || episode.status === "complete") {
		return false;
	}
	return episode.status === "pending" || episode.status === "searching";
}

function rejectAdultContent(errorValue: unknown): void {
	if (errorValue instanceof AdultContentError) {
		error(400, errorValue.message);
	}
}

async function resolveShowMetadata(params: AddSeasonFromBrowseParams): Promise<ShowMetadata> {
	try {
		const details = await getTVDetails(params.tmdbId);
		return {
			backdropUrl: params.backdropUrl ?? details.backdropUrl,
			certification: params.certification ?? details.certification ?? null,
			genres: params.genres ? JSON.stringify(params.genres) : (details.genres ?? null),
			originalLanguage: details.originalLanguage ?? null,
			overview: params.overview ?? details.overview,
			posterUrl: params.posterUrl ?? details.posterUrl,
			runtime: details.runtime ?? null,
			title: params.title || details.title,
			totalSeasons: details.totalSeasons ?? null,
			voteAverage: details.voteAverage ?? null,
			year: params.year ?? details.year ?? null,
		};
	} catch (errorValue) {
		rejectAdultContent(errorValue);
		console.error(`[Season Sync] Failed to resolve TV metadata for ${params.tmdbId}:`, errorValue);
		return {
			backdropUrl: params.backdropUrl ?? null,
			certification: params.certification ?? null,
			genres: params.genres ? JSON.stringify(params.genres) : null,
			originalLanguage: null,
			overview: params.overview ?? null,
			posterUrl: params.posterUrl ?? null,
			runtime: null,
			title: params.title,
			totalSeasons: null,
			voteAverage: null,
			year: params.year ?? null,
		};
	}
}

async function saveShowImages(showId: string, metadata: ShowMetadata): Promise<void> {
	if (!(metadata.posterUrl || metadata.backdropUrl)) {
		return;
	}
	try {
		const showDirectoryId = getShowLibraryDirectoryId({ id: showId, title: metadata.title, year: metadata.year });
		const savedImages = await savePosterBackdropImages(
			{
				backdropUrl: metadata.backdropUrl,
				posterUrl: metadata.posterUrl,
			},
			"library",
			showDirectoryId
		);
		mediaDb.updateMetadata(showId, {
			backdropUrl: savedImages.backdropUrl,
			posterUrl: savedImages.posterUrl,
		});
	} catch (errorValue) {
		console.error(`[Season Sync] Failed to save images for ${showId}:`, errorValue);
	}
}

async function upsertShow(userId: string, organizationId: string, params: AddSeasonFromBrowseParams): Promise<string> {
	const metadata = await resolveShowMetadata(params);
	const existingShow = mediaDb.getByTmdbId(params.tmdbId, organizationId, "show");
	if (existingShow) {
		mediaDb.updateMetadata(existingShow.id, {
			backdropUrl: metadata.backdropUrl,
			certification: metadata.certification,
			genres: metadata.genres,
			originalLanguage: metadata.originalLanguage,
			overview: metadata.overview,
			posterUrl: metadata.posterUrl,
			runtime: metadata.runtime,
			title: metadata.title,
			tmdbId: params.tmdbId,
			totalSeasons: metadata.totalSeasons,
			voteAverage: metadata.voteAverage,
			year: metadata.year,
		});
		saveShowImages(existingShow.id, metadata).catch(() => undefined);
		return existingShow.id;
	}
	const show = mediaDb.create({
		backdropUrl: metadata.backdropUrl,
		certification: metadata.certification,
		genres: metadata.genres,
		organizationId,
		originalLanguage: metadata.originalLanguage,
		overview: metadata.overview,
		posterUrl: metadata.posterUrl,
		runtime: metadata.runtime,
		title: metadata.title,
		tmdbId: params.tmdbId,
		totalSeasons: metadata.totalSeasons,
		type: "show",
		userId,
		voteAverage: metadata.voteAverage,
		year: metadata.year,
	});
	saveShowImages(show.id, metadata).catch(() => undefined);
	return show.id;
}

async function syncSeasonMetadata(showId: string, tmdbId: number, seasonNumber: number) {
	const show = mediaDb.getById(showId);
	if (!(show && show.type === "show")) {
		throw new Error("Show not found");
	}
	const seasonDetails = await getSeasonDetailsWithExternalIds(tmdbId, seasonNumber);
	const airedEpisodes = seasonDetails.episodes.filter((episode) => isEpisodeAired(episode.airDate));
	const existingSeason = seasonsDb.getByMediaAndNumber(showId, seasonDetails.seasonNumber);
	const season = existingSeason
		? (() => {
				seasonsDb.update(existingSeason.id, {
					episodeCount: airedEpisodes.length,
					name: seasonDetails.name,
				});
				return seasonsDb.getById(existingSeason.id) ?? existingSeason;
			})()
		: seasonsDb.create({
				episodeCount: airedEpisodes.length,
				mediaId: showId,
				name: seasonDetails.name,
				seasonNumber: seasonDetails.seasonNumber,
			});

	for (const [displayOrder, episode] of airedEpisodes.entries()) {
		const existingEpisode = mediaDb.getEpisodeByParentAndNumber(
			showId,
			seasonDetails.seasonNumber,
			episode.episodeNumber
		);
		const nextStatus = episode.imdbId ? "pending" : "not_found";
		if (existingEpisode) {
			let { status } = existingEpisode;
			if (!(episode.imdbId || existingEpisode.filePath || existingEpisode.magnetLink)) {
				status = nextStatus;
			} else if (existingEpisode.status === "not_found" && episode.imdbId && !existingEpisode.filePath) {
				status = "pending";
			}
			mediaDb.update(existingEpisode.id, {
				airDate: episode.airDate,
				displayOrder,
				episodeNumber: episode.episodeNumber,
				imdbId: episode.imdbId,
				overview: episode.overview,
				parentId: showId,
				runtime: episode.runtime,
				seasonId: season.id,
				seasonNumber: seasonDetails.seasonNumber,
				status,
				stillPath: episode.stillPath,
				title: episode.title ?? `Episode ${episode.episodeNumber}`,
				tmdbId: episode.tmdbId,
			});
			continue;
		}
		mediaDb.create({
			airDate: episode.airDate,
			displayOrder,
			episodeNumber: episode.episodeNumber,
			imdbId: episode.imdbId,
			organizationId: show.organizationId,
			overview: episode.overview,
			parentId: showId,
			runtime: episode.runtime,
			seasonId: season.id,
			seasonNumber: seasonDetails.seasonNumber,
			status: nextStatus,
			stillPath: episode.stillPath,
			title: episode.title ?? `Episode ${episode.episodeNumber}`,
			tmdbId: episode.tmdbId,
			type: "episode",
			userId: show.userId,
		});
	}

	return season;
}

async function processSeasonEpisode(mediaId: string): Promise<void> {
	const episode = mediaDb.getById(mediaId);
	if (!(episode && episode.type === "episode" && shouldQueueEpisode(episode))) {
		return;
	}
	mediaDb.update(mediaId, { progress: 0, status: "searching" });
	const result = await acquireMediaByImdb(mediaId, {
		episodeNumber: episode.episodeNumber,
		mediaType: "episode",
		seasonNumber: episode.seasonNumber,
	});
	if (result.status === "started" || result.status === "active") {
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
			// biome-ignore lint/performance/noAwaitInLoops: worker pool caps concurrency at SEASON_DOWNLOAD_CONCURRENCY
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
	userId: string,
	organizationId: string,
	params: AddSeasonFromBrowseParams
): Promise<void> {
	const showId = await upsertShow(userId, organizationId, params);
	const season = await syncSeasonMetadata(showId, params.tmdbId, params.seasonNumber);
	queueSeasonDownloads(showId, season.id, season.seasonNumber);
}
