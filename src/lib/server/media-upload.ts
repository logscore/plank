// Collects chunked video uploads in the temp store, then finalizes them into the library
// FEATURE: Manual video upload from the redownload dialog

import fs from "node:fs/promises";
import path from "node:path";
import { assert } from "$lib/utils";
import { appendChunk } from "./chunk-upload";
import { downloadsDb, mediaDb } from "./db";
import { isSupportedFormat } from "./ffmpeg";
import { PATHS } from "./paths";
import { cancelDownload } from "./torrent/download";
import { finalizeFromTemp } from "./torrent/recovery";

export const UPLOAD_FILE_BYTES_MAX = 200 * 1024 * 1024 * 1024;

/** Stop the torrent and drop old temp data. The library file stays until the new file replaces it. */
async function resetUpload(mediaId: string, tempDir: string): Promise<void> {
	await cancelDownload(mediaId);
	downloadsDb.deleteByMediaId(mediaId);
	mediaDb.update(mediaId, { infohash: null, magnetLink: null });
	await fs.rm(tempDir, { force: true, recursive: true });
}

function finalizeInBackground(mediaId: string, videoPath: string): void {
	finalizeFromTemp(mediaId, videoPath, path.basename(videoPath))
		.then((finalized) => {
			if (!finalized) {
				mediaDb.updateProgress(mediaId, 0, "error");
			}
		})
		.catch((cause) => {
			console.error(`[Upload] [${mediaId}] Finalize failed:`, cause);
			mediaDb.updateProgress(mediaId, 0, "error");
		});
}

/** Append one video chunk and return the byte count the server holds. Offset zero starts a new upload. */
export async function appendUploadChunk(
	mediaId: string,
	extension: string,
	fileSize: number,
	offset: number,
	chunk: Uint8Array
): Promise<number> {
	assert(isSupportedFormat(extension), "appendUploadChunk: extension must be a supported video format");

	const tempDir = path.join(PATHS.temp, mediaId);
	const videoPath = path.join(tempDir, `upload${extension}`);
	if (offset === 0) {
		await resetUpload(mediaId, tempDir);
	}
	// Recovery finalizes any video it finds here after a restart, so the partial file must not look like one.
	const partPath = `${videoPath}.part`;
	const received = await appendChunk(partPath, fileSize, offset, chunk);
	mediaDb.updateProgress(mediaId, received / fileSize, "downloading");
	if (received === fileSize) {
		await fs.rename(partPath, videoPath);
		finalizeInBackground(mediaId, videoPath);
	}
	return received;
}
