import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { mediaDb } from "../db";
import {
	type ActiveDownload,
	getDownloadOwnerMediaId,
	getDownloadsForMedia,
	resolveEpisodeFileIndex,
	type TorrentFile,
} from "./client";
import { getMimeType } from "./files";

export interface StreamInfo {
	stream: Readable;
	fileSize: number;
	fileName: string;
	mimeType: string;
	isComplete: boolean;
}

/** Create stream from library file */
function createLibraryStream(filePath: string, start?: number, end?: number): StreamInfo | null {
	try {
		const stats = statSync(filePath);
		const fileName = path.basename(filePath);

		const streamOptions: { start?: number; end?: number } = {};
		if (start !== undefined) {
			streamOptions.start = start;
		}
		if (end !== undefined) {
			streamOptions.end = end;
		}

		return {
			stream: createReadStream(filePath, streamOptions),
			fileSize: stats.size,
			fileName,
			mimeType: getMimeType(fileName),
			isComplete: true,
		};
	} catch (e) {
		console.error(`Error reading file from library: ${e}`);
		return null;
	}
}

function getLibraryVideoStream(
	mediaItem: { filePath: string | null },
	start?: number,
	end?: number
): StreamInfo | null {
	if (!(mediaItem.filePath && existsSync(mediaItem.filePath))) {
		return null;
	}
	return createLibraryStream(mediaItem.filePath, start, end);
}

/** Get stream from active torrent download */
function getTorrentStream(
	download: ActiveDownload,
	fileIndex: number | undefined,
	start?: number,
	end?: number
): StreamInfo | null {
	if (download.mediaType === "show" && fileIndex !== undefined) {
		const videoFile = download.videoFiles[fileIndex];
		if (!videoFile) {
			return null;
		}

		for (const [i, f] of download.videoFiles.entries()) {
			if (i === fileIndex) {
				f.select();
			} else {
				f.deselect();
			}
		}

		download.selectedFileIndex = fileIndex;
		return createTorrentStream(download, videoFile, start, end);
	}

	if (download.videoFile) {
		return createTorrentStream(download, download.videoFile, start, end);
	}

	return null;
}

export async function getVideoStream(mediaId: string, start?: number, end?: number): Promise<StreamInfo | null> {
	const mediaItem = mediaDb.getById(mediaId);
	if (!mediaItem || mediaItem.type === "show") {
		return null;
	}
	const libraryStream = getLibraryVideoStream(mediaItem, start, end);
	if (libraryStream) {
		return libraryStream;
	}
	const downloadOwnerId = getDownloadOwnerMediaId(mediaItem);
	const downloads = getDownloadsForMedia(downloadOwnerId);
	const fileIndex = resolveEpisodeFileIndex(mediaItem, downloads);

	const suitableDownload = downloads.find((d) => {
		if (d.status === "error") {
			return false;
		}
		if (d.mediaType === "movie" && d.videoFile) {
			return true;
		}
		if (d.mediaType === "show" && fileIndex !== undefined) {
			return d.videoFiles[fileIndex] !== undefined;
		}
		return false;
	});

	if (!suitableDownload) {
		return null;
	}
	return getTorrentStream(suitableDownload, fileIndex, start, end);
}

function createTorrentStream(
	download: ActiveDownload,
	videoFile: TorrentFile,
	start?: number,
	end?: number
): StreamInfo {
	const fileSize = videoFile.length;
	const fileName = videoFile.name;

	// Track active stream
	download.activeStreams++;

	const streamOptions: { start?: number; end?: number } = {};
	if (start !== undefined) {
		streamOptions.start = start;
	}
	if (end !== undefined) {
		streamOptions.end = end;
	}

	const torrentStream = videoFile.createReadStream(streamOptions);

	// Decrement active streams when stream ends
	const decrementStreams = () => {
		download.activeStreams = Math.max(0, download.activeStreams - 1);
	};

	torrentStream.once("end", decrementStreams);
	torrentStream.once("error", decrementStreams);
	torrentStream.once("close", decrementStreams);

	return {
		stream: torrentStream,
		fileSize,
		fileName,
		mimeType: getMimeType(fileName),
		isComplete: download.status === "complete",
	};
}
