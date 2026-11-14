import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mediaDb } from "./db";
import { normalizeFileForPlayback, probeFile, requiresBrowserSafePlayback } from "./ffmpeg";

const activeNormalizationJobs = new Map<string, Promise<string | null>>();

let activeLibraryScan: Promise<void> | null = null;

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

async function isDirectPlaybackReady(filePath: string): Promise<boolean> {
	if (path.extname(filePath).toLowerCase() !== ".mp4") {
		return false;
	}
	try {
		return !(await requiresBrowserSafePlayback(filePath));
	} catch (error) {
		console.error(`[Transcoder] Failed to verify direct playback for ${filePath}:`, error);
		return false;
	}
}

export async function transcodeLibrary(): Promise<void> {
	if (activeLibraryScan) {
		return activeLibraryScan;
	}

	activeLibraryScan = (async () => {
		await scanMovies();
		await scanShows();
	})();

	try {
		await activeLibraryScan;
	} finally {
		activeLibraryScan = null;
	}
}

async function scanMovies(): Promise<void> {
	const movies = mediaDb
		.getAll()
		.filter((media) => media.type === "movie" && media.filePath && existsSync(media.filePath));
	// Change to a job eventually
	for (const movie of movies) {
		// biome-ignore lint/performance/noAwaitInLoops: ffmpeg jobs run one at a time
		await normalizeMediaForPlayback(movie.id);
	}
}

async function scanShows(): Promise<void> {
	const showIds = mediaDb
		.getAll()
		.filter((media) => media.type === "show")
		.map((media) => media.id);
	const episodes = showIds.flatMap((showId) => mediaDb.getEpisodesByParentId(showId));
	// Change to a job eventually
	for (const episode of episodes) {
		// biome-ignore lint/performance/noAwaitInLoops: ffmpeg jobs run one at a time
		await normalizeMediaForPlayback(episode.id);
	}
}

export async function finalizeMediaToLibrary(
	sourcePath: string,
	targetPath: string,
	onProgress?: (progress: number) => void
): Promise<{ filePath: string; fileSize: number }> {
	onProgress?.(0);
	await fs.mkdir(path.dirname(targetPath), { recursive: true });

	const needsNormalization = await shouldNormalizeFile(sourcePath);
	const finalPath = needsNormalization
		? `${path.join(path.dirname(targetPath), path.basename(targetPath, path.extname(targetPath)))}.mp4`
		: targetPath;
	const tempPath = path.join(
		path.dirname(finalPath),
		`${path.basename(finalPath, path.extname(finalPath))}.finalizing${path.extname(finalPath)}`
	);

	const workDir = await fs.mkdtemp(path.join(tmpdir(), "plank-finalize-"));
	const preparedPath = needsNormalization ? path.join(workDir, path.basename(finalPath)) : sourcePath;
	try {
		if (needsNormalization) {
			await normalizeFileForPlayback(sourcePath, preparedPath, onProgress);
		}
		if (!(await verifyFileIntegrity(preparedPath))) {
			throw new Error(`Finalized file is invalid: ${preparedPath}`);
		}
		if (!(await isDirectPlaybackReady(preparedPath))) {
			throw new Error(`Finalized file is not browser-safe: ${preparedPath}`);
		}

		await fs.rm(tempPath, { force: true });
		await fs.copyFile(preparedPath, tempPath);
		await fs.rename(tempPath, finalPath);
		const file = await fs.open(finalPath, "r+");
		try {
			await file.sync();
		} finally {
			await file.close();
		}
		const stats = await fs.stat(finalPath);
		onProgress?.(1);
		return { filePath: finalPath, fileSize: stats.size };
	} finally {
		await fs.unlink(tempPath).catch(() => undefined);
		await fs.rm(workDir, { force: true, recursive: true });
	}
}

async function normalizeMediaForPlayback(mediaId: string): Promise<string | null> {
	const existingJob = activeNormalizationJobs.get(mediaId);

	if (existingJob) {
		return existingJob;
	}

	const job = (async () => {
		const media = mediaDb.getById(mediaId);
		if (!(media?.filePath && existsSync(media.filePath))) {
			return media?.filePath ?? null;
		}
		if (!(await shouldNormalizeFile(media.filePath))) {
			return media.filePath;
		}
		console.log(`[Transcoder] Normalizing ${media.type} ${mediaId}: ${media.filePath}`);
		await safeNormalize(media.filePath, (newPath, newSize) => {
			if (media.type === "episode") {
				mediaDb.updateFileInfo(media.id, {
					fileIndex: media.fileIndex,
					filePath: newPath,
					fileSize: newSize,
				});
				return;
			}
			mediaDb.updateFilePath(media.id, newPath, newSize);
		});
		return mediaDb.getById(mediaId)?.filePath ?? media.filePath;
	})();

	activeNormalizationJobs.set(mediaId, job);
	try {
		return await job;
	} finally {
		activeNormalizationJobs.delete(mediaId);
	}
}

async function shouldNormalizeFile(filePath: string | null): Promise<boolean> {
	if (!(filePath && existsSync(filePath))) {
		return false;
	}
	const extension = path.extname(filePath).toLowerCase();
	if (extension !== ".mp4") {
		return true;
	}
	try {
		return await requiresBrowserSafePlayback(filePath);
	} catch (error) {
		console.error(`[Transcoder] Failed to probe playback compatibility for ${filePath}:`, error);
		return false;
	}
}

async function safeNormalize(sourcePath: string, updateDb: (path: string, size: number) => void): Promise<void> {
	try {
		const finalized = await finalizeMediaToLibrary(sourcePath, sourcePath);
		updateDb(finalized.filePath, finalized.fileSize);
		if (sourcePath !== finalized.filePath) {
			await fs
				.unlink(sourcePath)
				.catch((error) => console.warn(`Failed to delete original: ${sourcePath}`, error));
		}
	} catch (error) {
		console.error(`[Transcoder] Failed to transmux ${sourcePath}:`, error);
	}
}
