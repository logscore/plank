import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mediaDb } from './db';
import { probeFile, requiresBrowserSafePlayback, transmuxFile } from './ffmpeg';

async function verifyFileIntegrity(filePath: string): Promise<boolean> {
	try {
		const stats = await fs.stat(filePath);
		if (stats.size === 0) {
			return false;
		}
		const probe = await probeFile(filePath);
		return Boolean((probe.videoCodec || probe.audioCodec) && (probe.duration ?? 0) > 0);
	} catch (error) {
		console.error(`[Transcoder] Integrity check failed for ${filePath}:`, error);
		return false;
	}
}

export async function transcodeLibrary(): Promise<void> {
	await scanMovies();
	await scanShows();
}

async function scanMovies(): Promise<void> {
	const movies = mediaDb
		.getAll()
		.filter((media) => media.type === 'movie' && media.filePath && existsSync(media.filePath));
	const needsTranscoding = await Promise.all(
		movies.map(async (media) => ({ media, needsTranscoding: await shouldNormalizeFile(media.filePath) }))
	);
	await Promise.all(
		needsTranscoding.map(async ({ media, needsTranscoding }) => {
			if (!needsTranscoding) {
				return;
			}
			if (!media.filePath) {
				return;
			}
			await safeTransmux(media.filePath, (newPath, newSize) => {
				mediaDb.updateFilePath(media.id, newPath, newSize);
			});
		})
	);
}

async function scanShows(): Promise<void> {
	const showIds = mediaDb
		.getAll()
		.filter((media) => media.type === 'show')
		.map((media) => media.id);
	const episodes = showIds.flatMap((showId) => mediaDb.getEpisodesByParentId(showId));
	const needsTranscoding = await Promise.all(
		episodes.map(async (episode) => ({ episode, needsTranscoding: await shouldNormalizeFile(episode.filePath) }))
	);
	await Promise.all(
		needsTranscoding.map(async ({ episode, needsTranscoding }) => {
			if (!needsTranscoding) {
				return;
			}
			if (!episode.filePath || episode.fileIndex === null) {
				return;
			}
			await safeTransmux(episode.filePath, (newPath, newSize) => {
				mediaDb.updateFileInfo(episode.id, {
					fileIndex: episode.fileIndex,
					filePath: newPath,
					fileSize: newSize,
				});
			});
		})
	);
}

export async function transcodeMovieFile(mediaId: string): Promise<void> {
	const media = mediaDb.getById(mediaId);
	if (!(media?.filePath && existsSync(media.filePath))) {
		return;
	}
	if (!(await shouldNormalizeFile(media.filePath))) {
		return;
	}
	console.log(`[Transcoder] Transmuxing movie ${mediaId}: ${media.filePath}`);
	await safeTransmux(media.filePath, (newPath, newSize) => {
		mediaDb.updateFilePath(mediaId, newPath, newSize);
	});
}

export async function transcodeTVEpisodes(showId: string): Promise<void> {
	const episodes = mediaDb.getEpisodesByParentId(showId);
	const needsTranscoding = await Promise.all(
		episodes.map(async (episode) => ({ episode, needsTranscoding: await shouldNormalizeFile(episode.filePath) }))
	);
	const episodesToTranscode = needsTranscoding
		.filter(({ needsTranscoding }) => needsTranscoding)
		.map(({ episode }) => episode);
	if (episodesToTranscode.length === 0) {
		return;
	}
	console.log(`[Transcoder] Transmuxing ${episodesToTranscode.length} episodes for media ${showId}`);
	await Promise.all(
		episodesToTranscode.map(async (episode) => {
			if (!episode.filePath || episode.fileIndex === null) {
				return;
			}
			await safeTransmux(episode.filePath, (newPath, newSize) => {
				mediaDb.updateFileInfo(episode.id, {
					fileIndex: episode.fileIndex,
					filePath: newPath,
					fileSize: newSize,
				});
			});
		})
	);
}

async function shouldNormalizeFile(filePath: string | null): Promise<boolean> {
	if (!(filePath && existsSync(filePath))) {
		return false;
	}
	const extension = path.extname(filePath).toLowerCase();
	if (extension !== '.mp4' && extension !== '.webm') {
		return true;
	}
	if (extension === '.webm') {
		return false;
	}
	try {
		return await requiresBrowserSafePlayback(filePath);
	} catch (error) {
		console.error(`[Transcoder] Failed to probe playback compatibility for ${filePath}:`, error);
		return false;
	}
}

async function safeTransmux(sourcePath: string, updateDb: (path: string, size: number) => void): Promise<void> {
	const directory = path.dirname(sourcePath);
	const name = path.basename(sourcePath, path.extname(sourcePath));
	const tempPath = path.join(directory, `${name}.transcoding.mp4`);
	const finalPath = path.join(directory, `${name}.mp4`);
	try {
		await transmuxFile(sourcePath, tempPath);
		const isValid = await verifyFileIntegrity(tempPath);
		if (!isValid) {
			console.error(`[Transcoder] Transmuxed file corrupt: ${tempPath}`);
			await fs.unlink(tempPath).catch(() => undefined);
			return;
		}
		await fs.rename(tempPath, finalPath);
		const stats = await fs.stat(finalPath);
		updateDb(finalPath, stats.size);
		if (sourcePath !== finalPath) {
			await fs
				.unlink(sourcePath)
				.catch((error) => console.warn(`Failed to delete original: ${sourcePath}`, error));
		}
	} catch (error) {
		console.error(`[Transcoder] Failed to transmux ${sourcePath}:`, error);
		if (existsSync(tempPath)) {
			await fs.unlink(tempPath).catch(() => undefined);
		}
	}
}
