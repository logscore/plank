import fs from "node:fs/promises";
import path from "node:path";
import { mediaDb, seasonsDb } from "../db";
import {
	buildMovieFileName,
	getEpisodeLibraryPath,
	getMovieLibraryRoot,
	getSeasonLibraryDirectory,
	getShowLibraryRoot,
	PATHS,
} from "../paths";
import { discoverSubtitles } from "../subtitles";
import { finalizeMediaToLibrary } from "../transcoder";
import type { ActiveDownload, TorrentFile } from "./client";

function groupEpisodesBySeason(
	mapping: Map<number, number>
): Map<number, Array<{ episodeNumber: number; fileIndex: number }>> {
	const seasonEpisodes = new Map<number, Array<{ episodeNumber: number; fileIndex: number }>>();

	for (const [episodeKey, fileIndex] of mapping.entries()) {
		const season = Math.floor(episodeKey / 100);
		const episode = episodeKey % 100;

		if (!seasonEpisodes.has(season)) {
			seasonEpisodes.set(season, []);
		}
		seasonEpisodes.get(season)?.push({ episodeNumber: episode, fileIndex });
	}

	return seasonEpisodes;
}

function getOrAddSeason(mediaId: string, seasonNum: number, episodeCount: number) {
	let season = seasonsDb.getByMediaAndNumber(mediaId, seasonNum);

	if (!season) {
		season = seasonsDb.create({
			mediaId,
			seasonNumber: seasonNum,
			name: `Season ${seasonNum}`,
			episodeCount,
		});
	}

	return season;
}

function updateExistingEpisode(existingEpisode: { id: string }, videoFiles: TorrentFile[], fileIndex: number): void {
	const videoFile = videoFiles[fileIndex];
	if (videoFile) {
		mediaDb.updateFileInfo(existingEpisode.id, {
			fileIndex,
			filePath: videoFile.path,
			fileSize: videoFile.length,
		});
	}
}

function createNewEpisode(
	showMedia: { id: string; userId: string; organizationId: string | null },
	seasonId: string,
	seasonNumber: number,
	episodeNumber: number,
	displayOrder: number,
	videoFiles: TorrentFile[],
	fileIndex: number
): void {
	const videoFile = videoFiles[fileIndex];
	mediaDb.create({
		userId: showMedia.userId,
		organizationId: showMedia.organizationId,
		type: "episode",
		parentId: showMedia.id,
		seasonId,
		seasonNumber,
		episodeNumber,
		title: `Episode ${episodeNumber}`,
		fileIndex,
		filePath: videoFile?.path ?? null,
		fileSize: videoFile?.length ?? null,
		downloadedBytes: 0,
		displayOrder,
		status: "pending",
	});
}

async function processEpisodesForSeason(
	showMedia: { id: string; userId: string; organizationId: string | null },
	seasonNum: number,
	episodes: Array<{ episodeNumber: number; fileIndex: number }>,
	videoFiles: TorrentFile[]
): Promise<void> {
	const season = getOrAddSeason(showMedia.id, seasonNum, episodes.length);

	for (const [displayOrder, ep] of episodes.entries()) {
		const existingEpisode = mediaDb.getEpisodeBySeasonAndNumber(season.id, ep.episodeNumber);

		if (existingEpisode) {
			updateExistingEpisode(existingEpisode, videoFiles, ep.fileIndex);
		} else {
			createNewEpisode(showMedia, season.id, seasonNum, ep.episodeNumber, displayOrder, videoFiles, ep.fileIndex);
		}
	}

	seasonsDb.updateEpisodeCount(season.id, episodes.length);
}

export async function createEpisodesFromMapping(
	mediaId: string,
	videoFiles: TorrentFile[],
	mapping: Map<number, number>
): Promise<void> {
	const mediaItem = mediaDb.getById(mediaId);
	if (!mediaItem || mediaItem.type !== "show") {
		return;
	}

	const seasonEpisodes = groupEpisodesBySeason(mapping);

	for (const [seasonNum, episodes] of seasonEpisodes.entries()) {
		await processEpisodesForSeason(mediaItem, seasonNum, episodes, videoFiles);
	}
}

async function moveMovieToLibrary(mediaId: string, download: ActiveDownload): Promise<void> {
	const logPrefix = `[${mediaId}:${download.infohash.slice(0, 8)}]`;

	if (!download.videoFile) {
		return;
	}

	const sourcePath = path.join(download.torrent.path, download.videoFile.path);
	const mediaItem = mediaDb.getById(mediaId);
	const destDir = mediaItem ? getMovieLibraryRoot(mediaItem) : path.join(PATHS.library, mediaId);
	const fileName = mediaItem ? buildMovieFileName(mediaItem, download.videoFile.name) : download.videoFile.name;
	const destPath = path.join(destDir, fileName);

	await fs.mkdir(destDir, { recursive: true });
	const finalized = await finalizeMediaToLibrary(sourcePath, destPath);

	for (const subFile of download.subtitleFiles) {
		try {
			const subSource = path.join(download.torrent.path, subFile.path);
			const subDest = path.join(destDir, subFile.name);
			await fs.copyFile(subSource, subDest);
		} catch (subErr) {
			console.error(`${logPrefix} Failed to copy subtitle ${subFile.name}:`, subErr);
		}
	}

	mediaDb.updateFilePath(mediaId, finalized.filePath, finalized.fileSize);

	discoverSubtitles(mediaId, finalized.filePath, destDir).catch((err) => {
		console.error(`${logPrefix} Subtitle discovery failed:`, err);
	});
}

function getSeasonForFile(download: ActiveDownload, fileIndex: number): number {
	for (const [episodeKey, mappedIndex] of download.episodeMapping.entries()) {
		if (mappedIndex === fileIndex) {
			return Math.floor(episodeKey / 100);
		}
	}
	return 1;
}

async function updateEpisodeFileInfo(
	mediaId: string,
	download: ActiveDownload,
	videoFile: TorrentFile,
	filePath: string,
	fileSize: number
): Promise<void> {
	const fileIndex = download.videoFiles.indexOf(videoFile);

	for (const [episodeKey, mappedIndex] of download.episodeMapping.entries()) {
		if (mappedIndex !== fileIndex) {
			continue;
		}

		const seasonNum = Math.floor(episodeKey / 100);
		const episodeNum = episodeKey % 100;
		const season = seasonsDb.getByMediaAndNumber(mediaId, seasonNum);

		if (!season) {
			console.warn(`[${mediaId}] Season ${seasonNum} not found in DB for episode S${seasonNum}E${episodeNum}`);
			continue;
		}

		const episode = mediaDb.getEpisodeBySeasonAndNumber(season.id, episodeNum);
		if (episode) {
			mediaDb.updateFileInfo(episode.id, {
				fileIndex,
				filePath,
				fileSize,
			});
			mediaDb.updateEpisodeProgress(episode.id, fileSize, "complete");
			discoverSubtitles(episode.id, filePath, path.dirname(filePath)).catch((error) => {
				console.error(`[${mediaId}] Subtitle discovery failed for ${videoFile.name}:`, error);
			});
		} else {
			console.warn(`[${mediaId}] Episode S${seasonNum}E${episodeNum} not found in DB`);
		}
	}
}

function getEpisodeForFileIndex(mediaId: string, download: ActiveDownload, fileIndex: number) {
	for (const [episodeKey, mappedIndex] of download.episodeMapping.entries()) {
		if (mappedIndex !== fileIndex) {
			continue;
		}
		const seasonNumber = Math.floor(episodeKey / 100);
		const episodeNumber = episodeKey % 100;
		return mediaDb.getEpisodeByParentAndNumber(mediaId, seasonNumber, episodeNumber);
	}
	return undefined;
}

async function moveEpisodeToLibrary(mediaId: string, download: ActiveDownload): Promise<void> {
	const logPrefix = `[${mediaId}:${download.infohash.slice(0, 8)}]`;
	const episode = mediaDb.getById(mediaId);
	if (!(episode && episode.type === "episode" && download.videoFile)) {
		return;
	}
	const sourcePath = path.join(download.torrent.path, download.videoFile.path);
	const show = episode.parentId ? mediaDb.getById(episode.parentId) : null;
	if (!(show && show.type === "show")) {
		return;
	}
	const seasonDir = getSeasonLibraryDirectory(show, episode.seasonNumber);
	const destPath = getEpisodeLibraryPath(show, episode, download.videoFile.name);

	await fs.mkdir(seasonDir, { recursive: true });
	const finalized = await finalizeMediaToLibrary(sourcePath, destPath);
	for (const subFile of download.subtitleFiles) {
		try {
			const subSource = path.join(download.torrent.path, subFile.path);
			const subDest = path.join(seasonDir, subFile.name);
			await fs.copyFile(subSource, subDest);
		} catch (subErr) {
			console.error(`${logPrefix} Failed to copy subtitle ${subFile.name}:`, subErr);
		}
	}
	mediaDb.updateFileInfo(mediaId, {
		fileIndex: episode.fileIndex,
		filePath: finalized.filePath,
		fileSize: finalized.fileSize,
	});
	mediaDb.updateEpisodeProgress(mediaId, finalized.fileSize, "complete");
	discoverSubtitles(mediaId, finalized.filePath, seasonDir).catch((errorValue) => {
		console.error(`${logPrefix} Subtitle discovery failed:`, errorValue);
	});
}

async function moveTVShowToLibrary(mediaId: string, download: ActiveDownload): Promise<void> {
	const logPrefix = `[${mediaId}:${download.infohash.slice(0, 8)}]`;
	const show = mediaDb.getById(mediaId);
	if (!(show && show.type === "show")) {
		return;
	}
	const baseDir = getShowLibraryRoot(show);
	await fs.mkdir(baseDir, { recursive: true });

	const existingSeasons = seasonsDb.getByMediaId(mediaId);
	if (existingSeasons.length === 0 && download.episodeMapping) {
		try {
			await createEpisodesFromMapping(mediaId, download.videoFiles, download.episodeMapping);
		} catch (e) {
			console.error(`${logPrefix} Failed to create episodes during library move:`, e);
		}
	}

	const filesBySeason = new Map<number, TorrentFile[]>();
	for (const [index, videoFile] of download.videoFiles.entries()) {
		const seasonNum = getSeasonForFile(download, index);
		const files = filesBySeason.get(seasonNum) || [];
		files.push(videoFile);
		filesBySeason.set(seasonNum, files);
	}

	for (const subFile of download.subtitleFiles) {
		try {
			const subSource = path.join(download.torrent.path, subFile.path);
			const subDest = path.join(baseDir, subFile.name);
			await fs.copyFile(subSource, subDest);
		} catch (subErr) {
			console.error(`${logPrefix} Failed to copy subtitle ${subFile.name}:`, subErr);
		}
	}

	for (const [seasonNum, files] of filesBySeason.entries()) {
		const seasonDir = path.join(baseDir, `Season ${seasonNum.toString().padStart(2, "0")}`);
		await fs.mkdir(seasonDir, { recursive: true });

		for (const videoFile of files) {
			const fileIndex = download.videoFiles.indexOf(videoFile);
			const episode = getEpisodeForFileIndex(mediaId, download, fileIndex);
			const sourcePath = path.join(download.torrent.path, videoFile.path);
			const destPath = episode
				? getEpisodeLibraryPath(show, episode, videoFile.name)
				: path.join(seasonDir, videoFile.name);

			const finalized = await finalizeMediaToLibrary(sourcePath, destPath);
			await updateEpisodeFileInfo(mediaId, download, videoFile, finalized.filePath, finalized.fileSize);
		}
	}
}

export async function moveToLibrary(mediaId: string, download: ActiveDownload): Promise<void> {
	const mediaItem = mediaDb.getById(mediaId);
	if (mediaItem?.type === "episode") {
		await moveEpisodeToLibrary(mediaId, download);
		return;
	}
	if (download.mediaType === "movie") {
		await moveMovieToLibrary(mediaId, download);
	} else {
		await moveTVShowToLibrary(mediaId, download);
	}
}

export async function deleteMediaFiles(mediaId: string): Promise<void> {
	const mediaItem = mediaDb.getById(mediaId);
	if (mediaItem?.type === "episode") {
		if (mediaItem.filePath) {
			await fs.rm(mediaItem.filePath, { force: true }).catch(() => undefined);
		}
		await fs.rm(path.join(PATHS.temp, mediaId), { recursive: true, force: true }).catch(() => undefined);
		return;
	}
	let libraryPaths = [path.join(PATHS.library, mediaId)];
	if (mediaItem?.type === "show") {
		libraryPaths = Array.from(new Set([getShowLibraryRoot(mediaItem), path.join(PATHS.library, mediaId)]));
	} else if (mediaItem?.type === "movie") {
		libraryPaths = [getMovieLibraryRoot(mediaItem)];
	}
	const tempPaths =
		mediaItem?.type === "show"
			? [
					path.join(PATHS.temp, mediaId),
					...mediaDb.getEpisodesByParentId(mediaId).map((episode) => path.join(PATHS.temp, episode.id)),
				]
			: [path.join(PATHS.temp, mediaId)];

	for (const libraryPath of libraryPaths) {
		try {
			await fs.rm(libraryPath, { recursive: true, force: true });
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
				console.error(`[${mediaId}] Error deleting library directory:`, e);
			}
		}
	}

	for (const tempPath of tempPaths) {
		try {
			await fs.rm(tempPath, { recursive: true, force: true });
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
				console.error(`[${mediaId}] Error deleting temp directory:`, e);
			}
		}
	}
}
