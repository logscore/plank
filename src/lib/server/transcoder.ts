import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { episodesDb, mediaDb } from './db';
import { probeFile, transmuxFile } from './ffmpeg';

// Helper to check file integrity
async function verifyFileIntegrity(filePath: string): Promise<boolean> {
	try {
		const stats = await fs.stat(filePath);
		if (stats.size === 0) {
			return false;
		}

		const probe = await probeFile(filePath);
		// Check if we have valid video/audio streams
		return !!(probe.videoCodec || probe.audioCodec) && (probe.duration ?? 0) > 0;
	} catch (e) {
		console.error(`[Transcoder] Integrity check failed for ${filePath}:`, e);
		return false;
	}
}

export async function transcodeLibrary(): Promise<void> {
	await scanMovies();
	await scanTVShows();
}

async function scanMovies(): Promise<void> {
	const allMedia = mediaDb.getAll();
	const movieFiles = allMedia.filter(
		(media) => media.type === 'movie' && media.filePath && existsSync(media.filePath)
	);

	const needsTranscoding = movieFiles.filter((media) => {
		if (!media.filePath) {
			return false;
		}
		const ext = path.extname(media.filePath).toLowerCase();
		return ext !== '.mp4' && ext !== '.webm';
	});

	await Promise.all(
		needsTranscoding.map(async (media) => {
			if (!media.filePath) {
				return;
			}

			await safeTransmux(media.filePath, (newPath, newSize) => {
				mediaDb.updateFilePath(media.id, newPath, newSize);
			});
		})
	);
}

async function scanTVShows(): Promise<void> {
	const allMedia = mediaDb.getAll();
	const tvMediaIds = allMedia.filter((media) => media.type === 'tv').map((media) => media.id);

	if (tvMediaIds.length === 0) {
		return;
	}

	// Get all episodes for TV shows in a single structured query
	const allEpisodesWithSeasons = tvMediaIds.flatMap((mediaId) => episodesDb.getByMediaId(mediaId));

	const episodesToTranscode = allEpisodesWithSeasons.filter(
		({ episode }) =>
			episode.filePath &&
			existsSync(episode.filePath) &&
			episode.fileIndex !== null &&
			!['.mp4', '.webm'].includes(path.extname(episode.filePath).toLowerCase())
	);

	await Promise.all(
		episodesToTranscode.map(async ({ episode }) => {
			if (!episode.filePath || episode.fileIndex === null) {
				return;
			}

			await safeTransmux(episode.filePath, (newPath, newSize) => {
				if (episode.fileIndex !== null) {
					episodesDb.updateFileInfo(episode.id, episode.fileIndex, newPath, newSize);
				}
			});
		})
	);
}

async function safeTransmux(sourcePath: string, updateDb: (path: string, size: number) => void): Promise<void> {
	const dir = path.dirname(sourcePath);
	const name = path.basename(sourcePath, path.extname(sourcePath));
	const tempPath = path.join(dir, `${name}.transcoding.mp4`);
	const finalPath = path.join(dir, `${name}.mp4`);

	try {
		// Transmux to temp file first
		await transmuxFile(sourcePath, tempPath);

		// Verify integrity
		const isValid = await verifyFileIntegrity(tempPath);
		if (!isValid) {
			console.error(`[Transcoder] Transmuxed file corrupt: ${tempPath}`);
			await fs.unlink(tempPath).catch(() => {
				// Ignore cleanup error
			});
			return;
		}

		// Rename temp to final (atomic replacement if dest existed, but here we are creating new)
		await fs.rename(tempPath, finalPath);

		// Update DB
		const stats = await fs.stat(finalPath);
		updateDb(finalPath, stats.size);

		// Delete original if different
		if (sourcePath !== finalPath) {
			await fs.unlink(sourcePath).catch((err) => console.warn(`Failed to delete original: ${sourcePath}`, err));
		}
	} catch (e) {
		console.error(`[Transcoder] Failed to transmux ${sourcePath}:`, e);
		// Cleanup temp
		if (existsSync(tempPath)) {
			await fs.unlink(tempPath).catch(() => {
				// Ignore cleanup error
			});
		}
	}
}
